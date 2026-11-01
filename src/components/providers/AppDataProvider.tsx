"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  deleteDocument as deleteDocumentRequest,
  deleteDocumentIndex as deleteDocumentIndexRequest,
  getDocument as getDocumentRequest,
  getDocumentContent as getDocumentContentRequest,
  indexDocument as indexDocumentRequest,
  listDocuments,
  reprocessDocument as reprocessDocumentRequest,
  uploadDocumentFile,
  type ApiDocumentContent,
} from "@/lib/api/documents";
import {
  clearChatConversation,
  deleteChatConversation,
  listChatConversations,
  renameChatConversation,
} from "@/lib/api/chat";
import type { ChatMessage, Conversation } from "@/types/chat";
import type { Document } from "@/types/document";

interface AppDataContextValue {
  documents: Document[];
  documentsLoading: boolean;
  documentsError: string | null;
  refreshDocuments: () => Promise<void>;
  uploadDocument: (file: File, onProgress?: (percent: number) => void) => Promise<Document>;
  reprocessDocument: (id: string) => Promise<Document>;
  indexDocument: (id: string, force?: boolean) => Promise<Document>;
  deleteDocumentIndex: (id: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  getDocumentContent: (id: string) => Promise<ApiDocumentContent>;
  conversations: Conversation[];
  conversationsLoading: boolean;
  refreshConversations: () => Promise<void>;
  addConversation: (conversation: Conversation) => void;
  upsertConversation: (conversation: Conversation) => void;
  replaceConversation: (previousId: string, conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  appendMessage: (conversationId: string, message: ChatMessage) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  renameConversation: (id: string, title: string) => Promise<Conversation>;
  clearConversation: (id: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load documents";
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);

  const upsertDocument = useCallback((document: Document) => {
    setDocuments((current) => [
      document,
      ...current.filter((item) => item.id !== document.id),
    ]);
  }, []);

  const refreshDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    try {
      const items = await listDocuments();
      setDocuments(items);
      setDocumentsError(null);
    } catch (error) {
      setDocumentsError(errorMessage(error));
      throw error;
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    setConversationsLoading(true);
    try {
      const items = await listChatConversations();
      setConversations(items);
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDocuments().catch(() => undefined);
    void refreshConversations().catch(() => undefined);
  }, [refreshDocuments, refreshConversations]);

  const uploadDocument = useCallback(
    async (file: File, onProgress?: (percent: number) => void) => {
      const document = await uploadDocumentFile(file, onProgress);
      upsertDocument(document);
      setDocumentsError(null);
      return document;
    },
    [upsertDocument],
  );

  const reprocessDocument = useCallback(
    async (id: string) => {
      setDocuments((current) =>
        current.map((document) =>
          document.id === id
            ? {
                ...document,
                status: "processing",
                processingState: "EXTRACTING",
                error: undefined,
                errorCode: undefined,
              }
            : document,
        ),
      );
      try {
        const document = await reprocessDocumentRequest(id);
        upsertDocument(document);
        return document;
      } catch (error) {
        try {
          upsertDocument(await getDocumentRequest(id));
        } catch {
          // Keep the optimistic state when the API cannot be reached.
        }
        throw error;
      }
    },
    [upsertDocument],
  );

  const indexDocument = useCallback(
    async (id: string, force = false) => {
      setDocuments((current) =>
        current.map((document) =>
          document.id === id
            ? {
                ...document,
                indexing: {
                  ...(document.indexing ?? {
                    totalChunks: document.chunks,
                    embeddedChunks: 0,
                    vectorCount: 0,
                  }),
                  state: "EMBEDDING",
                  stage: "embedding",
                  error: undefined,
                },
              }
            : document,
        ),
      );
      try {
        const document = await indexDocumentRequest(id, force);
        upsertDocument(document);
        return document;
      } catch (error) {
        try {
          upsertDocument(await getDocumentRequest(id));
        } catch {
          // Keep the optimistic state when the API cannot be reached.
        }
        throw error;
      }
    },
    [upsertDocument],
  );

  const deleteDocumentIndex = useCallback(
    async (id: string) => {
      await deleteDocumentIndexRequest(id);
      setDocuments((current) =>
        current.map((document) =>
          document.id === id
            ? {
                ...document,
                indexing: document.indexing
                  ? {
                      ...document.indexing,
                      state: "NOT_INDEXED",
                      stage: "pending",
                      embeddedChunks: 0,
                      vectorCount: 0,
                      completedAt: undefined,
                      durationMs: undefined,
                      indexVersion: undefined,
                      error: undefined,
                    }
                  : document.indexing,
              }
            : document,
        ),
      );
    },
    [],
  );

  const deleteDocument = useCallback(async (id: string) => {
    await deleteDocumentRequest(id);
    setDocuments((current) => current.filter((document) => document.id !== id));
    setConversations((current) =>
      current.map((conversation) => ({
        ...conversation,
        documentIds: conversation.documentIds.filter((documentId) => documentId !== id),
      })),
    );
  }, []);

  const addConversation = useCallback((conversation: Conversation) => {
    setConversations((current) => [conversation, ...current]);
  }, []);

  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations((current) => [
      conversation,
      ...current.filter((item) => item.id !== conversation.id),
    ]);
  }, []);

  const replaceConversation = useCallback(
    (previousId: string, conversation: Conversation) => {
      setConversations((current) => [
        conversation,
        ...current.filter(
          (item) => item.id !== previousId && item.id !== conversation.id,
        ),
      ]);
    },
    [],
  );

  const updateConversation = useCallback((id: string, updates: Partial<Conversation>) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, ...updates } : conversation,
      ),
    );
  }, []);

  const appendMessage = useCallback((conversationId: string, message: ChatMessage) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              messages: [...conversation.messages, message],
              lastActivity: message.createdAt,
            }
          : conversation,
      ),
    );
  }, []);

  const updateMessage = useCallback(
    (conversationId: string, messageId: string, updates: Partial<ChatMessage>) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === messageId ? { ...message, ...updates } : message,
                ),
              }
            : conversation,
        ),
      );
    },
    [],
  );

  const renameConversation = useCallback(async (id: string, title: string) => {
    const renamed = await renameChatConversation(id, title);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id
          ? { ...conversation, title: renamed.title, lastActivity: renamed.lastActivity }
          : conversation,
      ),
    );
    return renamed;
  }, []);

  const clearConversation = useCallback(async (id: string) => {
    const cleared = await clearChatConversation(id);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              messages: cleared.messages,
              lastActivity: cleared.lastActivity,
            }
          : conversation,
      ),
    );
    return cleared;
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    if (!id.startsWith("temp-")) {
      await deleteChatConversation(id);
    }
    setConversations((current) =>
      current.filter((conversation) => conversation.id !== id),
    );
  }, []);

  const value = useMemo(
    () => ({
      documents,
      documentsLoading,
      documentsError,
      refreshDocuments,
      uploadDocument,
      reprocessDocument,
      indexDocument,
      deleteDocumentIndex,
      deleteDocument,
      getDocumentContent: getDocumentContentRequest,
      conversations,
      conversationsLoading,
      refreshConversations,
      addConversation,
      upsertConversation,
      replaceConversation,
      updateConversation,
      appendMessage,
      updateMessage,
      renameConversation,
      clearConversation,
      deleteConversation,
    }),
    [
      documents,
      documentsLoading,
      documentsError,
      refreshDocuments,
      uploadDocument,
      reprocessDocument,
      indexDocument,
      deleteDocumentIndex,
      deleteDocument,
      conversations,
      conversationsLoading,
      refreshConversations,
      addConversation,
      upsertConversation,
      replaceConversation,
      updateConversation,
      appendMessage,
      updateMessage,
      renameConversation,
      clearConversation,
      deleteConversation,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error("useAppData must be used within AppDataProvider");
  return context;
}
