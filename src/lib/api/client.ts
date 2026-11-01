export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  request_id?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string;
      details?: unknown;
      requestId?: string;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code ?? "API_ERROR";
    this.details = options.details;
    this.requestId = options.requestId;
  }
}

export function apiErrorFromPayload(
  payload: unknown,
  status: number,
  fallbackMessage = "The request could not be completed",
): ApiError {
  const data =
    payload && typeof payload === "object" ? (payload as ApiErrorPayload) : undefined;
  return new ApiError(data?.error?.message ?? fallbackMessage, {
    status,
    code: data?.error?.code ?? (status === 0 ? "NETWORK_ERROR" : "API_ERROR"),
    details: data?.error?.details,
    requestId: data?.request_id,
  });
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Unable to reach the DocuMind API", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    throw apiErrorFromPayload(payload, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
