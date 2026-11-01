"use client";

import { Eraser, History, Info, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ConversationPanel } from "@/components/chat/ConversationPanel";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  mapAgent,
  mapChatMessage,
  mapRetrieval,
  mapSource,
  type ApiChatQueryResponse,
  type ApiChatSource,
} from "@/lib/api/chat";
import { streamChat } from "@/lib/api/chatStream";
import { ApiError } from "@/lib/api/client";
import { generateId, titleFromPrompt } from "@/lib/utils";
import type {
  ChatAttachment,
  ChatMessage,
  ChatStage,
  ChatWorkflowState,
  Conversation,
} from "@/types/chat";

interface WorkflowStartedData {
  conversation_id: string;
  user_message_id: string;
  conversation_title?: string;
}

interface QueryAnalyzedData {
  intent?: string;
  rewritten_query?: string;
}

interface RetrievalStartedData {
  queries?: string[];
  document_count?: number;
}

interface RetrievalCompletedData {
  chunk_count?: number;
  duration_ms?: number;
}

interface RerankingCompletedData {
  enabled?: boolean;
  method?: string;
}

interface EvidenceEvaluatedData {
  status?: string;
  citation_count?: number;
  coverage_score?: number;
}

interface GenerationStartedData {
  mode?: string;
  replace?: boolean;
  attempt?: number;
}

interface TokenData {
  token: string;
  generation?: number;
}

interface CitationData {
  citations?: ApiChatSource[];
}

interface GroundednessCompletedData {
  status?: string;
  error_code?: string | null;
  score?: number;
  action?: string;
}

interface ErrorData {
  code: string;
  message: string;
  partial?: boolean;
  retryable?: boolean;
  conversation_id?: string | null;
  user_message_id?: string | null;
}

interface StreamExecution {
  mode: "send" | "regenerate" | "retry";
  prompt: string;
  originalConversationId: string;
  serverConversationId?: string;
  documentIds: string[];
  existingMessages: ChatMessage[];
  optimisticMessages: ChatMessage[];
  optimisticUserMessageId?: string;
  placeholderId: string;
  restoreOnFailure?: ChatMessage;
  title: string;
}

function makeStage(
  state: ChatWorkflowState,
  label: string,
  detail?: string,
  extra: Partial<ChatStage> = {},
): ChatStage {
  return { state, label, detail, ...extra };
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function ChatSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-7.25rem)] min-h-[560px] overflow-hidden rounded-xl border border-line bg-surface/60">
      <div className="hidden w-[264px] border-r border-line p-3 lg:block">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="mt-2.5 h-8 w-full" />
        <div className="mt-5 space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center border-b border-line px-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Skeleton className="h-24 w-72" />
        </div>
        <div className="border-t border-line p-4">
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

function ChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    documents,
    conversations,
    conversationsLoading,
    addConversation,
    replaceConversation,
    updateMessage,
    updateConversation,
    deleteConversation,
    renameConversation,
    clearConversation,
  } = useAppData();
  const { toast } = useToast();

  const indexedDocuments = documents.filter((document) => document.status === "indexed");
  const allIndexedIds = indexedDocuments.map((document) => document.id);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(allIndexedIds);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [clearTarget, setClearTarget] = useState<Conversation | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastParams = useRef<string | null>(null);
  const defaultSourcesApplied = useRef(false);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const messages = activeConversation?.messages ?? [];
  const selectedDocuments = documents.filter(
    (document) => selectedIds.includes(document.id) && document.status === "indexed",
  );
  const selectedChunks = selectedDocuments.reduce((sum, document) => sum + document.chunks, 0);
  const allSourcesSelected =
    indexedDocuments.length > 0 && selectedIds.length === indexedDocuments.length;
  const liveStage =
    [...messages].reverse().find((message) => message.status === "streaming")?.stage ?? null;

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  const executeStream = async ({
    mode,
    prompt,
    originalConversationId,
    serverConversationId,
    documentIds,
    existingMessages,
    optimisticMessages,
    optimisticUserMessageId,
    placeholderId,
    restoreOnFailure,
    title,
  }: StreamExecution) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);

    let workingConversationId = originalConversationId;
    let workingTitle = title;
    let accumulated = "";
    let flushTimer: number | null = null;
    let terminal = false;

    const markPlaceholder = (updates: Partial<ChatMessage>) => {
      updateMessage(workingConversationId, placeholderId, updates);
    };

    const updateStage = (
      state: ChatWorkflowState,
      label: string,
      detail?: string,
      extra: Partial<ChatStage> = {},
    ) => {
      markPlaceholder({
        status: "streaming",
        provisional: true,
        stage: makeStage(state, label, detail, extra),
      });
    };

    const flushTokens = () => {
      flushTimer = null;
      markPlaceholder({
        content: accumulated,
        status: "streaming",
        provisional: true,
      });
    };

    const scheduleTokenFlush = () => {
      if (flushTimer !== null) return;
      flushTimer = window.setTimeout(flushTokens, 32);
    };

    const cancelTokenFlush = () => {
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    const restorePreviousAnswer = (description: string) => {
      if (!restoreOnFailure) return false;
      markPlaceholder({
        content: restoreOnFailure.content,
        status: "complete",
        provisional: false,
        stage: undefined,
        sources: restoreOnFailure.sources,
        retrieval: restoreOnFailure.retrieval,
        agent: restoreOnFailure.agent,
        processingMs: restoreOnFailure.processingMs,
        evidenceStatus: restoreOnFailure.evidenceStatus,
        validationStatus: restoreOnFailure.validationStatus,
        queryRewritten: restoreOnFailure.queryRewritten,
        error: undefined,
      });
      toast({
        title: "Previous answer kept",
        description,
        tone: "error",
      });
      return true;
    };

    markPlaceholder({
      content: "",
      status: "streaming",
      provisional: true,
      stage: makeStage("CONNECTING", "Connecting to the agent", "Opening a live response"),
      sources: undefined,
      retrieval: undefined,
      agent: undefined,
      processingMs: undefined,
      evidenceStatus: undefined,
      validationStatus: undefined,
      queryRewritten: undefined,
      error: undefined,
    });

    try {
      for await (const event of streamChat({
        prompt,
        documentIds,
        conversationId: serverConversationId,
        regenerate: mode === "regenerate",
        signal: controller.signal,
      })) {
        if (terminal) break;

        switch (event.event) {
          case "workflow_started": {
            const data = event.data as unknown as WorkflowStartedData;
            const serverId = data.conversation_id;
            workingTitle = data.conversation_title?.trim() || workingTitle;

            if (workingConversationId !== serverId) {
              const migratedMessages = optimisticMessages.map((message) =>
                message.id === optimisticUserMessageId
                  ? { ...message, id: data.user_message_id }
                  : message,
              );
              replaceConversation(workingConversationId, {
                id: serverId,
                title: workingTitle,
                lastActivity: new Date().toISOString(),
                documentIds,
                messages: migratedMessages,
                isDemo: false,
              });
              workingConversationId = serverId;
              setActiveId(serverId);
              lastParams.current = `conversation=${serverId}`;
              router.replace(`/dashboard/chat?conversation=${serverId}`, { scroll: false });
            } else {
              updateConversation(workingConversationId, {
                title: workingTitle,
                lastActivity: new Date().toISOString(),
              });
            }

            updateStage("CONNECTING", "Agent workflow started", `Request ${event.request_id.slice(0, 8)}`);
            break;
          }
          case "query_analyzed": {
            const data = event.data as unknown as QueryAnalyzedData;
            updateStage(
              "ANALYZING",
              "Analyzing the question",
              data.rewritten_query || (data.intent ? data.intent.replaceAll("_", " ").toLowerCase() : undefined),
            );
            break;
          }
          case "retrieval_started": {
            const data = event.data as unknown as RetrievalStartedData;
            const queryCount = data.queries?.length ?? 1;
            updateStage(
              "RETRIEVING",
              "Retrieving document evidence",
              `${queryCount} search ${queryCount === 1 ? "query" : "queries"} across ${data.document_count ?? documentIds.length} sources`,
            );
            break;
          }
          case "retrieval_completed": {
            const data = event.data as unknown as RetrievalCompletedData;
            updateStage(
              "RERANKING",
              "Ranking retrieved evidence",
              `${data.chunk_count ?? 0} chunks in ${Math.round(data.duration_ms ?? 0)} ms`,
              { retrievalChunkCount: data.chunk_count },
            );
            break;
          }
          case "reranking_completed": {
            const data = event.data as unknown as RerankingCompletedData;
            updateStage(
              "RERANKING",
              "Ranking retrieved evidence",
              data.enabled === false
                ? "Semantic ranking complete"
                : `${data.method ?? "Cross-encoder"} ranking complete`,
              { rerankEnabled: data.enabled, rerankMethod: data.method },
            );
            break;
          }
          case "evidence_evaluated": {
            const data = event.data as unknown as EvidenceEvaluatedData;
            updateStage(
              "RERANKING",
              "Selecting grounded evidence",
              data.status
                ? `${data.status.toLowerCase()} evidence${data.citation_count !== undefined ? ` · ${data.citation_count} citations` : ""}`
                : undefined,
              {
                coverageStatus: data.status,
                coverageScore: data.coverage_score,
              },
            );
            break;
          }
          case "generation_started": {
            const data = event.data as unknown as GenerationStartedData;
            if (data.replace) {
              accumulated = "";
              cancelTokenFlush();
            }
            updateStage(
              "GENERATING",
              data.attempt && data.attempt > 1 ? "Regenerating grounded answer" : "Generating grounded answer",
              data.mode ? `${data.mode.toLowerCase()} mode` : undefined,
              { retryCount: data.attempt && data.attempt > 1 ? data.attempt - 1 : undefined },
            );
            break;
          }
          case "token": {
            const data = event.data as unknown as TokenData;
            accumulated += data.token;
            scheduleTokenFlush();
            break;
          }
          case "citation": {
            const data = event.data as unknown as CitationData;
            const citations = data.citations ?? [];
            if (citations.length > 0) {
              markPlaceholder({
                content: accumulated,
                sources: citations.map(mapSource),
              });
            }
            updateStage(
              "VERIFYING",
              "Validating citations",
              `${citations.length} source${citations.length === 1 ? "" : "s"} linked`,
            );
            break;
          }
          case "groundedness_completed": {
            const data = event.data as unknown as GroundednessCompletedData;
            updateStage(
              "VERIFYING",
              "Verifying claim-level groundedness",
              data.status
                ? `${data.status.toLowerCase().replaceAll("_", " ")}${data.score !== undefined ? ` · ${data.score.toFixed(2)}` : ""}${data.error_code ? ` · ${data.error_code}` : ""}`
                : undefined,
              {
                groundednessStatus: data.status,
                groundednessScore: data.score,
              },
            );
            break;
          }
          case "completed": {
            terminal = true;
            cancelTokenFlush();
            const result = event.data as unknown as ApiChatQueryResponse;
            const serverUserMessage = mapChatMessage(result.user_message);
            const assistantMessage: ChatMessage = {
              ...mapChatMessage(result.assistant_message),
              sources: result.sources.map(mapSource),
              retrieval: mapRetrieval(result.retrieval),
              agent: mapAgent(result.agent),
            };
            const baseMessages = existingMessages.filter(
              (message) =>
                message.id !== placeholderId &&
                message.id !== serverUserMessage.id &&
                (!restoreOnFailure || message.id !== restoreOnFailure.id),
            );
            const completedConversation: Conversation = {
              id: result.conversation_id,
              title: workingTitle,
              lastActivity: assistantMessage.createdAt,
              documentIds,
              messages: [...baseMessages, serverUserMessage, assistantMessage],
              isDemo: false,
            };
            replaceConversation(workingConversationId, completedConversation);
            setActiveId(result.conversation_id);
            lastParams.current = `conversation=${result.conversation_id}`;
            router.replace(`/dashboard/chat?conversation=${result.conversation_id}`, {
              scroll: false,
            });
            break;
          }
          case "error": {
            terminal = true;
            cancelTokenFlush();
            const data = event.data as unknown as ErrorData;
            if (mode === "regenerate" && restorePreviousAnswer(data.message)) {
              break;
            }
            markPlaceholder({
              content: accumulated,
              status: "error",
              provisional: accumulated.length > 0,
              stage: makeStage("FAILED", "Generation stopped", data.message),
              error: {
                code: data.code,
                message: data.message,
                retryable: data.retryable !== false,
              },
            });
            updateConversation(workingConversationId, {
              lastActivity: new Date().toISOString(),
            });
            toast({
              title: data.code === "GEMINI_NOT_CONFIGURED" ? "Gemini is not configured" : "Agent response failed",
              description: data.message,
              tone: "error",
            });
            break;
          }
          default:
            break;
        }
      }
    } catch (error) {
      terminal = true;
      cancelTokenFlush();
      if (isAbortError(error)) {
        if (mode === "regenerate" && restorePreviousAnswer("Generation was stopped before the new answer was verified.")) {
          return;
        }
        markPlaceholder({
          content: accumulated,
          status: "cancelled",
          provisional: accumulated.length > 0,
          stage: makeStage("CANCELLED", "Response stopped", "The partial answer was not saved"),
          error: {
            code: "GENERATION_CANCELLED",
            message: "Generation was stopped before the answer could be verified.",
            retryable: true,
          },
        });
        return;
      }

      const apiError = error instanceof ApiError ? error : null;
      const description =
        error instanceof Error ? error.message : "The DocuMind API could not complete the request.";
      if (mode === "regenerate" && restorePreviousAnswer(description)) {
        return;
      }
      markPlaceholder({
        content: accumulated,
        status: "error",
        provisional: accumulated.length > 0,
        stage: makeStage("FAILED", "Unable to complete the response", description),
        error: {
          code: apiError?.code ?? "AGENT_ERROR",
          message: description,
          retryable: true,
        },
      });
      updateConversation(workingConversationId, {
        lastActivity: new Date().toISOString(),
      });
      toast({
        title:
          apiError?.code === "GEMINI_NOT_CONFIGURED"
            ? "Gemini is not configured"
            : "Agent request failed",
        description,
        tone: "error",
      });
    } finally {
      cancelTokenFlush();
      if (!terminal) {
        markPlaceholder({
          content: accumulated,
          status: "error",
          provisional: accumulated.length > 0,
          stage: makeStage("FAILED", "Stream ended unexpectedly", "The response did not finish."),
          error: {
            code: "STREAM_INCOMPLETE",
            message: "The live response ended before completion.",
            retryable: true,
          },
        });
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (defaultSourcesApplied.current || allIndexedIds.length === 0) return;
    defaultSourcesApplied.current = true;
    if (!searchParams.get("conversation") && !searchParams.get("document")) {
      setSelectedIds(allIndexedIds);
    }
  }, [allIndexedIds, searchParams]);

  useEffect(() => {
    const paramsKey = searchParams.toString();
    if (lastParams.current === paramsKey) return;
    const conversationId = searchParams.get("conversation");
    const documentId = searchParams.get("document");
    const conversation = conversationId
      ? conversations.find((item) => item.id === conversationId)
      : null;

    if (conversationId && !conversation && conversationsLoading) return;

    lastParams.current = paramsKey;
    if (conversationId) {
      if (conversation) {
        const validIds = conversation.documentIds.filter((id) =>
          indexedDocuments.some((document) => document.id === id),
        );
        setActiveId(conversation.id);
        setSelectedIds(validIds.length > 0 ? validIds : allIndexedIds);
      } else {
        setActiveId(null);
        setSelectedIds(allIndexedIds);
      }
      return;
    }
    if (documentId) {
      setActiveId(null);
      setSelectedIds([documentId]);
      return;
    }
    setActiveId(null);
    setSelectedIds(allIndexedIds);
  }, [
    searchParams,
    conversations,
    conversationsLoading,
    indexedDocuments,
    allIndexedIds,
  ]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startNewChat = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setInput("");
    setAttachments([]);
    setSelectedIds(allIndexedIds);
    setMobileHistoryOpen(false);
    lastParams.current = "";
    router.replace("/dashboard/chat", { scroll: false });
    window.setTimeout(() => textareaRef.current?.focus(), 80);
  };

  const selectConversation = (conversation: Conversation) => {
    abortRef.current?.abort();
    const validIds = conversation.documentIds.filter((id) =>
      indexedDocuments.some((document) => document.id === id),
    );
    setActiveId(conversation.id);
    setSelectedIds(validIds.length > 0 ? validIds : allIndexedIds);
    setInput("");
    setAttachments([]);
    setMobileHistoryOpen(false);
    lastParams.current = "";
    router.replace(`/dashboard/chat?conversation=${conversation.id}`, { scroll: false });
  };

  const sendPrompt = async (prompt: string, forceNew = false) => {
    if (!prompt.trim() || isGenerating) return;

    const documentIds = selectedDocuments.map((document) => document.id);
    if (documentIds.length === 0) {
      toast({
        title: "No indexed sources selected",
        description: "Select at least one indexed document before asking a question.",
        tone: "error",
      });
      return;
    }

    const attachmentSnapshot = attachments;
    const baseConversation = forceNew ? null : activeConversation;
    const existingMessages = baseConversation?.messages ?? [];
    const serverConversationId =
      baseConversation && !baseConversation.id.startsWith("temp-")
        ? baseConversation.id
        : undefined;
    const conversationId = baseConversation?.id ?? generateId("temp-conv");
    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: generateId("temp-msg"),
      role: "user",
      content: prompt.trim(),
      createdAt: now,
      attachments: attachmentSnapshot.length > 0 ? attachmentSnapshot : undefined,
    };
    const assistantMessage: ChatMessage = {
      id: generateId("temp-msg"),
      role: "assistant",
      content: "",
      createdAt: now,
      status: "streaming",
      provisional: true,
      stage: makeStage("CONNECTING", "Connecting to the agent"),
    };
    const conversationTitle = baseConversation?.title ?? titleFromPrompt(prompt);
    const pendingConversation: Conversation = {
      id: conversationId,
      title: conversationTitle,
      lastActivity: now,
      documentIds,
      messages: [...existingMessages, userMessage, assistantMessage],
      isDemo: false,
    };

    if (baseConversation) {
      updateConversation(conversationId, {
        messages: pendingConversation.messages,
        lastActivity: now,
      });
    } else {
      addConversation(pendingConversation);
      setActiveId(conversationId);
    }

    setInput("");
    setAttachments([]);
    lastParams.current = baseConversation ? lastParams.current : "pending";

    await executeStream({
      mode: "send",
      prompt: prompt.trim(),
      originalConversationId: conversationId,
      serverConversationId,
      documentIds,
      existingMessages,
      optimisticMessages: pendingConversation.messages,
      optimisticUserMessageId: userMessage.id,
      placeholderId: assistantMessage.id,
      title: conversationTitle,
    });
  };

  const sendMessage = async () => {
    await sendPrompt(input);
  };

  const regenerateMessage = async (assistantMessage: ChatMessage) => {
    if (!activeConversation || isGenerating) return;
    if (activeConversation.id.startsWith("temp-")) {
      toast({
        title: "This answer is not saved yet",
        description: "Wait for the first response to finish before regenerating it.",
        tone: "error",
      });
      return;
    }
    const lastUser = [...activeConversation.messages].reverse().find((message) => message.role === "user");
    if (!lastUser) return;

    const documentIds =
      selectedDocuments.length > 0
        ? selectedDocuments.map((document) => document.id)
        : activeConversation.documentIds;
    const pendingMessages = activeConversation.messages.map((message) =>
      message.id === assistantMessage.id
        ? {
            ...message,
            content: "",
            status: "streaming" as const,
            provisional: true,
            stage: makeStage("CONNECTING", "Preparing regeneration"),
            error: undefined,
          }
        : message,
    );
    updateConversation(activeConversation.id, {
      messages: pendingMessages,
      lastActivity: new Date().toISOString(),
    });

    await executeStream({
      mode: "regenerate",
      prompt: lastUser.content,
      originalConversationId: activeConversation.id,
      serverConversationId: activeConversation.id,
      documentIds,
      existingMessages: activeConversation.messages,
      optimisticMessages: pendingMessages,
      placeholderId: assistantMessage.id,
      restoreOnFailure: assistantMessage,
      title: activeConversation.title,
    });
  };

  const retryMessage = async (assistantMessage: ChatMessage) => {
    if (!activeConversation || isGenerating) return;
    const lastUser = [...activeConversation.messages].reverse().find((message) => message.role === "user");
    if (!lastUser) return;

    if (activeConversation.id.startsWith("temp-")) {
      await deleteConversation(activeConversation.id);
      setActiveId(null);
      await sendPrompt(lastUser.content, true);
      return;
    }

    const documentIds =
      selectedDocuments.length > 0
        ? selectedDocuments.map((document) => document.id)
        : activeConversation.documentIds;
    const pendingMessages = activeConversation.messages.map((message) =>
      message.id === assistantMessage.id
        ? {
            ...message,
            content: "",
            status: "streaming" as const,
            provisional: true,
            stage: makeStage("CONNECTING", "Retrying the grounded answer"),
            error: undefined,
          }
        : message,
    );
    updateConversation(activeConversation.id, {
      messages: pendingMessages,
      lastActivity: new Date().toISOString(),
    });

    await executeStream({
      mode: "retry",
      prompt: lastUser.content,
      originalConversationId: activeConversation.id,
      serverConversationId: activeConversation.id,
      documentIds,
      existingMessages: activeConversation.messages,
      optimisticMessages: pendingMessages,
      placeholderId: assistantMessage.id,
      title: activeConversation.title,
    });
  };

  const confirmDeleteConversation = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === activeId) {
      abortRef.current?.abort();
      setActiveId(null);
      setSelectedIds(allIndexedIds);
      lastParams.current = "";
      router.replace("/dashboard/chat", { scroll: false });
    }
    try {
      await deleteConversation(deleteTarget.id);
      toast({
        title: "Conversation deleted",
        description: `"${deleteTarget.title}" was removed from persisted history.`,
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Delete failed",
        description:
          error instanceof Error ? error.message : "Unable to delete conversation.",
        tone: "error",
      });
    }
    setDeleteTarget(null);
  };

  const confirmClearConversation = async () => {
    if (!clearTarget) return;
    if (clearTarget.id === activeId) {
      abortRef.current?.abort();
    }
    try {
      await clearConversation(clearTarget.id);
      toast({
        title: "Conversation cleared",
        description: "The saved message history was cleared. The conversation title was kept.",
        tone: "success",
      });
    } catch (error) {
      toast({
        title: "Clear failed",
        description:
          error instanceof Error ? error.message : "Unable to clear conversation.",
        tone: "error",
      });
    }
    setClearTarget(null);
  };

  const renameConversationTitle = async (conversation: Conversation, title: string) => {
    try {
      await renameConversation(conversation.id, title);
      toast({ title: "Conversation renamed", tone: "success" });
    } catch (error) {
      toast({
        title: "Rename failed",
        description:
          error instanceof Error ? error.message : "Unable to rename conversation.",
        tone: "error",
      });
    }
  };

  return (
    <div className="relative flex h-[calc(100dvh-7.25rem)] min-h-[560px] overflow-hidden rounded-xl border border-line bg-surface/60 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.8)]">
      <div className="hidden w-[264px] shrink-0 border-r border-line lg:block">
        <ConversationPanel
          conversations={conversations}
          activeId={activeId}
          onSelect={selectConversation}
          onNew={startNewChat}
          onDelete={setDeleteTarget}
          onClear={setClearTarget}
          onRename={renameConversationTitle}
        />
      </div>

      {mobileHistoryOpen ? (
        <button
          type="button"
          aria-label="Close conversation history"
          onClick={() => setMobileHistoryOpen(false)}
          className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      ) : null}
      <aside
        className={`absolute inset-y-0 left-0 z-40 w-[280px] border-r border-line shadow-2xl transition-transform duration-300 lg:hidden ${
          mobileHistoryOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <button
            type="button"
            onClick={() => setMobileHistoryOpen(false)}
            className="absolute right-2 top-2 z-10 rounded-md p-1.5 text-subtle hover:bg-white/5 hover:text-foreground"
            aria-label="Close conversation history"
          >
            <X className="size-4" />
          </button>
          <ConversationPanel
            conversations={conversations}
            activeId={activeId}
            onSelect={selectConversation}
            onNew={startNewChat}
            onDelete={setDeleteTarget}
            onClear={setClearTarget}
            onRename={renameConversationTitle}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-[#0a0c16]/70 px-3 backdrop-blur sm:px-4">
          <button
            type="button"
            onClick={() => setMobileHistoryOpen(true)}
            className="flex size-8 items-center justify-center rounded-lg border border-line bg-white/[0.03] text-muted transition hover:bg-white/[0.06] hover:text-foreground lg:hidden"
            aria-label="Open conversation history"
          >
            <History className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[12px] font-semibold text-foreground">
                {activeConversation?.title ?? "New conversation"}
              </h1>
              <span className="hidden rounded-full border border-warning/15 bg-warning/[0.05] px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.1em] text-warning/80 sm:inline-flex">
                Agentic RAG
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[8.5px] text-subtle">
              <span className={`size-1 rounded-full ${isGenerating ? "animate-pulse bg-accent-bright" : "bg-accent"}`} />
              {isGenerating && liveStage
                ? liveStage.label
                : selectedDocuments.length === indexedDocuments.length
                  ? "All indexed sources"
                  : `${selectedDocuments.length} source${selectedDocuments.length === 1 ? "" : "s"}`}
              <span className="size-0.5 rounded-full bg-white/15" />
              {messages.length} messages
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="hidden items-center gap-1 rounded-md border border-line bg-white/[0.025] px-2 py-1 text-[8px] text-subtle sm:flex">
              <Info className="size-2.5" />
              LangGraph
            </span>
            {messages.length > 0 && activeConversation && !activeConversation.id.startsWith("temp-") ? (
              <button
                type="button"
                onClick={() => setClearTarget(activeConversation)}
                className="flex size-7.5 items-center justify-center rounded-lg text-subtle transition hover:bg-white/5 hover:text-foreground"
                aria-label="Clear conversation"
                title="Clear conversation"
              >
                <Eraser className="size-3.5" />
              </button>
            ) : null}
            {messages.length > 0 && activeConversation ? (
              <button
                type="button"
                onClick={() => setDeleteTarget(activeConversation)}
                className="flex size-7.5 items-center justify-center rounded-lg text-subtle transition hover:bg-danger/10 hover:text-[#ff9aaa]"
                aria-label="Delete conversation"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={startNewChat}
              className="flex h-7.5 items-center gap-1.5 rounded-lg border border-line bg-white/[0.03] px-2.5 text-[9.5px] font-medium text-muted transition hover:bg-white/[0.06] hover:text-foreground"
            >
              <Plus className="size-3" />
              <span className="hidden sm:inline">New chat</span>
            </button>
          </div>
        </div>

        <ChatWindow
          messages={messages}
          isGenerating={isGenerating}
          selectedDocumentCount={selectedDocuments.length}
          totalChunks={selectedChunks}
          allSourcesSelected={allSourcesSelected}
          onExampleClick={(prompt) => {
            setInput(prompt);
            window.setTimeout(() => textareaRef.current?.focus(), 50);
          }}
          onRegenerate={regenerateMessage}
          onRetry={retryMessage}
        />

        <ChatInput
          value={input}
          onChange={setInput}
          onSend={sendMessage}
          onStop={stopGeneration}
          isGenerating={isGenerating}
          documents={documents}
          selectedDocumentIds={selectedIds}
          onSelectionChange={setSelectedIds}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          textareaRef={textareaRef}
        />
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteConversation}
        title="Delete this conversation?"
        description={`"${deleteTarget?.title ?? "This conversation"}" and its persisted message history will be removed. This cannot be undone.`}
        confirmLabel="Delete conversation"
      />

      <ConfirmDialog
        open={Boolean(clearTarget)}
        onClose={() => setClearTarget(null)}
        onConfirm={confirmClearConversation}
        title="Clear this conversation?"
        description={`All saved messages in "${clearTarget?.title ?? "this conversation"}" will be removed. The conversation itself will be kept.`}
        confirmLabel="Clear messages"
      />

      <div className="pointer-events-none absolute bottom-24 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-[#0a0c16]/80 px-2.5 py-1 text-[7.5px] text-subtle/50 backdrop-blur lg:flex">
        <Sparkles className="size-2.5" />
        Grounded agentic retrieval
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ChatContent />
    </Suspense>
  );
}
