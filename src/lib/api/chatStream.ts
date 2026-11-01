import { API_BASE_URL, ApiError, apiErrorFromPayload } from "@/lib/api/client";

export const CHAT_STREAM_EVENTS = [
  "workflow_started",
  "query_analyzed",
  "retrieval_started",
  "retrieval_completed",
  "reranking_completed",
  "evidence_evaluated",
  "generation_started",
  "token",
  "citation",
  "groundedness_completed",
  "completed",
  "error",
] as const;

export type ChatStreamEventName = (typeof CHAT_STREAM_EVENTS)[number];

export interface ChatStreamEvent<T = Record<string, unknown>> {
  event: ChatStreamEventName;
  sequence: number;
  request_id: string;
  timestamp: string;
  data: T;
}

export interface ChatStreamRequestPayload {
  prompt: string;
  documentIds: string[];
  conversationId?: string | null;
  regenerate?: boolean;
  topK?: number;
  similarityThreshold?: number;
  temperature?: number;
  signal?: AbortSignal;
  onOpen?: () => void;
}

const knownEvents = new Set<string>(CHAT_STREAM_EVENTS);

function parseEventBlock(block: string): ChatStreamEvent | null {
  let name = "message";
  const dataLines: string[] = [];

  for (const rawLine of block.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      name = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0 || !knownEvents.has(name)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    throw new ApiError("The chat stream returned malformed data.", {
      status: 0,
      code: "STREAM_PROTOCOL_ERROR",
    });
  }
  if (!payload || typeof payload !== "object") return null;
  const event = payload as ChatStreamEvent;
  if (event.event !== name || typeof event.sequence !== "number") return null;
  return event;
}

export async function* streamChat(
  payload: ChatStreamRequestPayload,
): AsyncGenerator<ChatStreamEvent, void, void> {
  const headers = new Headers({
    Accept: "text/event-stream",
    "Content-Type": "application/json",
  });
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: payload.prompt,
        document_ids: payload.documentIds,
        conversation_id: payload.conversationId ?? undefined,
        regenerate: payload.regenerate ?? false,
        top_k: payload.topK,
        similarity_threshold: payload.similarityThreshold,
        temperature: payload.temperature,
      }),
      cache: "no-store",
      signal: payload.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError("Unable to reach the DocuMind API", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  payload.onOpen?.();

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    throw apiErrorFromPayload(body, response.status);
  }
  if (!response.body) {
    throw new ApiError("The chat stream could not be opened.", {
      status: response.status,
      code: "STREAM_UNAVAILABLE",
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastSequence = 0;
  let finished = false;

  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separator = buffer.match(/\r?\n\r?\n/);
      while (separator && separator.index !== undefined) {
        const block = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const event = parseEventBlock(block);
        if (event) {
          if (event.sequence > lastSequence) {
            lastSequence = event.sequence;
            yield event;
          }
          if (event.event === "completed" || event.event === "error") {
            finished = true;
            break;
          }
        }
        separator = buffer.match(/\r?\n\r?\n/);
      }
    }
  } finally {
    if (!finished) {
      try {
        await reader.cancel();
      } catch {
        // The abort path can close the body before cancellation completes.
      }
    }
    reader.releaseLock();
  }
}
