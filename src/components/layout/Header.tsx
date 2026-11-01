"use client";

import {
  Activity,
  ArrowRight,
  Bell,
  ChevronDown,
  ChevronRight,
  FileText,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Sparkles,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DASHBOARD_NAV, SYSTEM_SERVICES } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/utils";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  documents: "Documents",
  chat: "AI Workspace",
  conversations: "Conversations",
  analytics: "Retrieval Analytics",
  health: "System Health",
  settings: "Settings",
};

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  href: string;
  icon: "file" | "sparkles" | "activity";
}

const notifications: NotificationItem[] = [
  {
    id: "notification-1",
    title: "Indexing simulation complete",
    description: "Agentic RAG Systems Survey.pdf is ready in the demo library.",
    time: "2026-10-30T08:12:00.000Z",
    href: "/dashboard/documents",
    icon: "file",
  },
  {
    id: "notification-2",
    title: "Demo environment refreshed",
    description: "Illustrative retrieval metrics have been updated.",
    time: "2026-10-29T18:40:00.000Z",
    href: "/dashboard/analytics",
    icon: "activity",
  },
  {
    id: "notification-3",
    title: "Backend integration planned",
    description: "Gemini and FastAPI connectivity will arrive in Phase 2.",
    time: "2026-10-28T10:05:00.000Z",
    href: "/dashboard/health",
    icon: "sparkles",
  },
];

const notificationIcons = {
  file: FileText,
  sparkles: Sparkles,
  activity: Activity,
};

const serviceTones = {
  operational: "text-success",
  pending: "text-warning",
  disconnected: "text-danger",
  unconfigured: "text-subtle",
  demo: "text-accent-bright",
};

export function Header({ onOpenMobile }: { onOpenMobile: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { documents, conversations } = useAppData();
  const { toast } = useToast();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [readNotifications, setReadNotifications] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const segments = pathname.split("/").filter(Boolean);
  const currentLabel = segments.length > 1 ? routeLabels[segments[1]] : "Overview";
  const unreadCount = notifications.filter((item) => !readNotifications.includes(item.id)).length;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [searchOpen]);

  const normalizedQuery = query.trim().toLowerCase();
  const matchedDocuments = documents
    .filter((document) => document.name.toLowerCase().includes(normalizedQuery))
    .slice(0, 5);
  const matchedConversations = conversations
    .filter((conversation) => conversation.title.toLowerCase().includes(normalizedQuery))
    .slice(0, 3);
  const matchedPages = DASHBOARD_NAV.filter((item) =>
    item.label.toLowerCase().includes(normalizedQuery),
  ).slice(0, 4);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const goTo = (href: string) => {
    closeSearch();
    router.push(href);
  };

  const markAllRead = () => {
    setReadNotifications(notifications.map((item) => item.id));
    toast({ title: "Notifications marked as read", tone: "success" });
  };

  return (
    <>
      <header className="glass sticky top-0 z-30 flex h-16 items-center border-b border-line px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobile}
            className="rounded-lg border border-line bg-white/[0.03] p-2 text-muted transition hover:bg-white/[0.06] hover:text-foreground md:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </button>

          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[12px]">
            <Link
              href="/dashboard"
              className="hidden text-subtle transition hover:text-foreground sm:block"
            >
              Workspace
            </Link>
            <ChevronRight className="hidden size-3 text-subtle/50 sm:block" />
            <span className="truncate font-medium text-foreground">{currentLabel}</span>
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-8.5 items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 text-[11.5px] text-subtle transition hover:border-line-strong hover:bg-white/[0.05] hover:text-muted sm:w-44 lg:w-56"
            aria-label="Search workspace"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="hidden flex-1 text-left sm:block">Search workspace...</span>
            <kbd className="hidden items-center gap-0.5 rounded border border-line bg-white/[0.04] px-1 py-0.5 font-mono text-[9px] text-subtle lg:flex">
              <span className="text-[10px]">⌘</span>K
            </kbd>
          </button>

          <Dropdown
            trigger={
              <div className="flex h-8.5 items-center gap-1.5 rounded-lg border border-line bg-white/[0.03] px-2.5 text-[11px] text-muted transition hover:border-line-strong hover:bg-white/[0.055]">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-50" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-warning" />
                </span>
                <span className="hidden sm:inline">Demo mode</span>
                <ChevronDown className="size-3 text-subtle" />
              </div>
            }
            contentClassName="w-80 p-0"
            label="View system status"
          >
            <div className="border-b border-line px-3.5 py-3">
              <p className="text-[12px] font-medium text-foreground">Environment status</p>
              <p className="mt-0.5 text-[10.5px] leading-4 text-subtle">
                Interface is live. External services are not connected.
              </p>
            </div>
            <div className="space-y-0.5 p-1.5">
              {SYSTEM_SERVICES.slice(0, 5).map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                >
                  <span className="text-[11.5px] text-muted">{service.name}</span>
                  <span
                    className={`text-[10px] font-medium ${
                      serviceTones[service.status as keyof typeof serviceTones]
                    }`}
                  >
                    {service.statusLabel}
                  </span>
                </div>
              ))}
            </div>
            <Link
              href="/dashboard/health"
              className="flex items-center justify-between border-t border-line px-3.5 py-2.5 text-[11px] font-medium text-accent-bright transition hover:bg-white/[0.03]"
            >
              View system health
              <ArrowRight className="size-3" />
            </Link>
          </Dropdown>

          <Dropdown
            trigger={
              <div className="relative flex size-8.5 items-center justify-center rounded-lg border border-line bg-white/[0.03] text-muted transition hover:border-line-strong hover:bg-white/[0.055] hover:text-foreground">
                <Bell className="size-4" />
                {unreadCount > 0 ? (
                  <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent-bright ring-2 ring-[#0b0d18]" />
                ) : null}
              </div>
            }
            contentClassName="w-[min(340px,calc(100vw-2rem))] p-0"
            label="View notifications"
          >
            {(close) => (
              <>
                <div className="flex items-center justify-between border-b border-line px-3.5 py-3">
                  <div>
                    <p className="text-[12px] font-medium text-foreground">Notifications</p>
                    <p className="text-[10px] text-subtle">{unreadCount} unread · demo content</p>
                  </div>
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-[10.5px] font-medium text-accent-bright hover:text-foreground"
                  >
                    Mark all read
                  </button>
                </div>
                <div className="p-1.5">
                  {notifications.map((item) => {
                    const Icon = notificationIcons[item.icon];
                    const isRead = readNotifications.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setReadNotifications((current) => [...current, item.id]);
                          close();
                          router.push(item.href);
                        }}
                        className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-left transition hover:bg-white/[0.045]"
                      >
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-line bg-white/[0.035] text-accent-bright/80">
                          <Icon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[11.5px] font-medium text-foreground">
                              {item.title}
                            </span>
                            {!isRead ? <span className="size-1 shrink-0 rounded-full bg-accent" /> : null}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-4 text-muted">
                            {item.description}
                          </span>
                          <span className="mt-1 block text-[9.5px] text-subtle">
                            {formatRelativeTime(item.time)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </Dropdown>

          <Dropdown
            trigger={
              <div className="flex size-8.5 items-center justify-center rounded-full bg-[linear-gradient(145deg,#4a4474,#2b2844)] text-[10px] font-semibold text-[#dbd4ff] ring-1 ring-white/15 transition hover:ring-accent/40">
                AM
              </div>
            }
            contentClassName="w-56 p-0"
            label="Open user menu"
          >
            {(close) => (
              <>
                <div className="border-b border-line px-3.5 py-3">
                  <p className="text-[12px] font-medium text-foreground">Alex Morgan</p>
                  <p className="text-[10.5px] text-subtle">alex@documind.demo</p>
                  <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-accent/15 bg-accent-soft px-1.5 py-0.5 text-[9px] font-medium text-accent-bright">
                    Demo workspace
                  </p>
                </div>
                <div className="p-1.5">
                  <DropdownItem
                    icon={<User />}
                    onClick={() => {
                      close();
                      router.push("/dashboard/settings?tab=workspace");
                    }}
                  >
                    Profile
                  </DropdownItem>
                  <DropdownItem
                    icon={<Settings />}
                    onClick={() => {
                      close();
                      router.push("/dashboard/settings?tab=appearance");
                    }}
                  >
                    Preferences
                  </DropdownItem>
                  <DropdownItem
                    icon={<Activity />}
                    onClick={() => {
                      close();
                      router.push("/dashboard/health");
                    }}
                  >
                    Integration status
                  </DropdownItem>
                </div>
              </>
            )}
          </Dropdown>
        </div>
      </header>

      <Modal
        open={searchOpen}
        onClose={closeSearch}
        size="lg"
        className="top-[10%] max-h-[74vh] translate-y-0 self-start sm:top-[12%]"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <Search className="size-4 shrink-0 text-subtle" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (matchedDocuments[0]) {
                  goTo(`/dashboard/documents?doc=${matchedDocuments[0].id}`);
                } else if (matchedConversations[0]) {
                  goTo(`/dashboard/chat?conversation=${matchedConversations[0].id}`);
                }
              }
            }}
            placeholder="Search documents, conversations, and pages..."
            className="flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-subtle"
            aria-label="Search workspace"
          />
          <kbd className="rounded border border-line bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-subtle">
            ESC
          </kbd>
        </div>
        <div className="max-h-[54vh] overflow-y-auto p-2.5">
          {matchedDocuments.length === 0 &&
          matchedConversations.length === 0 &&
          matchedPages.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-line bg-white/[0.03]">
                <Search className="size-4 text-subtle" />
              </div>
              <p className="text-[13px] font-medium text-foreground">No results found</p>
              <p className="mt-1 text-[11.5px] text-muted">
                Try a document name, conversation title, or workspace page.
              </p>
            </div>
          ) : null}

          {matchedPages.length > 0 ? (
            <div className="mb-1">
              <p className="px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-subtle">
                Pages
              </p>
              {matchedPages.map((page) => (
                <button
                  key={page.href}
                  type="button"
                  onClick={() => goTo(page.href)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] text-muted transition hover:bg-white/[0.045] hover:text-foreground"
                >
                  <Activity className="size-3.5 text-subtle" />
                  <span className="flex-1">{page.label}</span>
                  <ArrowRight className="size-3 text-subtle" />
                </button>
              ))}
            </div>
          ) : null}

          {matchedDocuments.length > 0 ? (
            <div className="mb-1">
              <p className="px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-subtle">
                Documents
              </p>
              {matchedDocuments.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => goTo(`/dashboard/documents?doc=${document.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.045]"
                >
                  <FileText className="size-3.5 shrink-0 text-accent-bright/70" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{document.name}</span>
                  <span className="text-[9.5px] text-subtle">{document.format}</span>
                </button>
              ))}
            </div>
          ) : null}

          {matchedConversations.length > 0 ? (
            <div>
              <p className="px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-subtle">
                Conversations
              </p>
              {matchedConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => goTo(`/dashboard/chat?conversation=${conversation.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.045]"
                >
                  <MessageSquare className="size-3.5 shrink-0 text-cyan/70" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
                    {conversation.title}
                  </span>
                  <span className="text-[9.5px] text-subtle">{conversation.messages.length} msgs</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
