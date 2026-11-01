"use client";

import { useMemo } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";

export function useConversations(search = "") {
  const {
    conversations,
    addConversation,
    updateConversation,
    appendMessage,
    updateMessage,
    deleteConversation,
  } = useAppData();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = [...conversations].sort(
      (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
    );
    if (!query) return sorted;
    return sorted.filter(
      (conversation) =>
        conversation.title.toLowerCase().includes(query) ||
        conversation.messages.some((message) => message.content.toLowerCase().includes(query)),
    );
  }, [conversations, search]);

  const totalMessages = useMemo(
    () => conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0),
    [conversations],
  );

  return {
    conversations,
    filtered,
    totalMessages,
    addConversation,
    updateConversation,
    appendMessage,
    updateMessage,
    deleteConversation,
  };
}
