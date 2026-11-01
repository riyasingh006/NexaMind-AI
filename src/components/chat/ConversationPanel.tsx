"use client";

import {
  Eraser,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Conversation } from "@/types/chat";

interface ConversationPanelProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (conversation: Conversation) => void;
  onNew: () => void;
  onDelete: (conversation: Conversation) => void;
  onClear: (conversation: Conversation) => void;
  onRename: (conversation: Conversation, title: string) => Promise<void>;
}

export function ConversationPanel({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClear,
  onRename,
}: ConversationPanelProps) {
  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

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

  return (
    <div className="flex h-full flex-col bg-[#090b14]">
      <div className="border-b border-line p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[11.5px] font-medium text-white shadow-[0_8px_20px_-8px_rgba(139,125,251,0.6)] transition hover:bg-[#9b8eff]"
        >
          <Plus className="size-3.5" />
          New chat
        </button>
        <div className="relative mt-2.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-subtle" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations..."
            className="h-8 w-full rounded-lg border border-line bg-white/[0.025] pl-8 pr-7 text-[10.5px] text-foreground outline-none transition placeholder:text-subtle focus:border-accent/30"
            aria-label="Search conversations"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-foreground"
              aria-label="Clear conversation search"
            >
              <X className="size-2.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-1.5 flex items-center justify-between px-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-subtle/70">
            Recent
          </span>
          <span className="font-mono text-[8px] text-subtle/50">{filtered.length}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <MessageSquare className="mx-auto size-5 text-subtle/50" />
            <p className="mt-2 text-[10.5px] font-medium text-muted">
              {search ? "No matching conversations" : "No conversations yet"}
            </p>
            <p className="mt-1 text-[9px] leading-4 text-subtle">
              {search ? "Try a different search term." : "Start a new chat to see it here."}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group relative flex items-center rounded-lg transition",
                    active ? "bg-accent-soft" : "hover:bg-white/[0.035]",
                  )}
                >
                  {active ? (
                    <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-bright" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelect(conversation)}
                    className="min-w-0 flex-1 px-2.5 py-2.5 text-left"
                  >
                    <span
                      className={cn(
                        "block truncate text-[10.5px] font-medium",
                        active ? "text-foreground" : "text-muted group-hover:text-foreground",
                      )}
                    >
                      {conversation.title}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-[8.5px] text-subtle">
                      <span>{formatRelativeTime(conversation.lastActivity)}</span>
                      <span className="size-0.5 rounded-full bg-white/15" />
                      <span>{conversation.messages.length} msgs</span>
                    </span>
                  </button>
                  <Dropdown
                    trigger={
                      <span className="mr-1 flex size-6 items-center justify-center rounded-md text-subtle opacity-0 transition hover:bg-white/5 hover:text-foreground group-hover:opacity-100 focus:opacity-100">
                        <MoreHorizontal className="size-3" />
                      </span>
                    }
                    contentClassName="w-40"
                    label={`Actions for ${conversation.title}`}
                  >
                    {(close) => (
                      <>
                        {!conversation.id.startsWith("temp-") ? (
                          <DropdownItem
                            icon={<Pencil />}
                            onClick={() => {
                              close();
                              setRenameTarget(conversation);
                              setRenameValue(conversation.title);
                            }}
                          >
                            Rename
                          </DropdownItem>
                        ) : null}
                        {conversation.messages.length > 0 &&
                        !conversation.id.startsWith("temp-") ? (
                          <DropdownItem
                            icon={<Eraser />}
                            onClick={() => {
                              close();
                              onClear(conversation);
                            }}
                          >
                            Clear messages
                          </DropdownItem>
                        ) : null}
                        <DropdownItem
                          icon={<Trash2 />}
                          danger
                          onClick={() => {
                            close();
                            onDelete(conversation);
                          }}
                        >
                          Delete chat
                        </DropdownItem>
                      </>
                    )}
                  </Dropdown>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-line px-3 py-2.5">
        <p className="text-[8px] leading-4 text-subtle/65">
          Conversation history is persisted by the DocuMind backend.
        </p>
      </div>

      <Modal
        open={Boolean(renameTarget)}
        onClose={() => {
          if (renaming) return;
          setRenameTarget(null);
        }}
        title="Rename conversation"
        description="Give this research thread a more descriptive title."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setRenameTarget(null)}
              disabled={renaming}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const title = renameValue.trim();
                if (!renameTarget || !title || renaming) return;
                setRenaming(true);
                try {
                  await onRename(renameTarget, title);
                  setRenameTarget(null);
                } finally {
                  setRenaming(false);
                }
              }}
              disabled={!renameValue.trim() || renaming}
            >
              {renaming ? "Saving..." : "Save title"}
            </Button>
          </>
        }
      >
        <div className="px-6 py-4">
          <label
            htmlFor="conversation-title"
            className="text-[10px] font-medium uppercase tracking-[0.12em] text-subtle"
          >
            Conversation title
          </label>
          <input
            id="conversation-title"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            maxLength={160}
            autoFocus
            className="mt-2 h-10 w-full rounded-lg border border-line bg-white/[0.03] px-3 text-[12px] text-foreground outline-none transition placeholder:text-subtle focus:border-accent/35"
            placeholder="Conversation title"
          />
          <p className="mt-2 text-[8.5px] text-subtle">
            {renameValue.trim().length}/160 characters
          </p>
        </div>
      </Modal>
    </div>
  );
}
