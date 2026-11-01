"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronRight,
  Files,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageSquare,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sparkles,
  Sun,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ElementType } from "react";
import { DASHBOARD_NAV } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useToast } from "@/components/providers/ToastProvider";

const iconMap: Record<string, ElementType> = {
  layoutDashboard: LayoutDashboard,
  files: Files,
  sparkles: Sparkles,
  messages: MessageSquare,
  search: Search,
  chart: BarChart3,
  activity: Activity,
  settings: Settings,
};

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    onMobileClose();
  }, [pathname, onMobileClose]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const cycleTheme = () => {
    const next = theme === "midnight" ? "dim" : "midnight";
    setTheme(next);
    toast({
      title: next === "dim" ? "Dim theme enabled" : "Midnight theme enabled",
      description: "Your appearance preference is saved in this browser.",
      tone: "success",
    });
  };

  return (
    <>
      <AnimatePresence>
        {mobileOpen ? (
          <motion.button
            type="button"
            aria-label="Close navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm md:hidden"
            onClick={onMobileClose}
          />
        ) : null}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-[#090b14]/95 backdrop-blur-xl transition-[width,transform] duration-300 ease-out md:translate-x-0",
          collapsed ? "md:w-[76px]" : "md:w-[264px]",
          "w-[264px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b border-line",
            collapsed ? "md:justify-center md:px-3" : "justify-between px-5",
          )}
        >
          <div className={collapsed ? "md:hidden" : ""}>
            <Logo href="/dashboard" />
          </div>
          <div className={cn("hidden", collapsed ? "md:block" : "md:hidden")}>
            <Link href="/dashboard" aria-label="DocuMind AI dashboard">
              <LogoMark />
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="hidden rounded-lg p-1.5 text-subtle transition hover:bg-white/5 hover:text-foreground md:block"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
            <button
              type="button"
              onClick={onMobileClose}
              className="rounded-lg p-1.5 text-subtle transition hover:bg-white/5 hover:text-foreground md:hidden"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {!collapsed ? (
          <div className="px-4 pt-4">
            <div className="rounded-xl border border-line bg-white/[0.025] p-3">
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
                <span className="size-1.5 rounded-full bg-accent" />
                Workspace
              </div>
              <p className="mt-1.5 text-[13px] font-medium text-foreground">Research Intelligence</p>
              <p className="mt-0.5 text-[10.5px] text-subtle">Demo environment · Local state</p>
            </div>
          </div>
        ) : (
          <div className="hidden h-4 md:block" />
        )}

        <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3 pb-4 scrollbar-none">
          <p
            className={cn(
              "mb-2 px-2 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-subtle/70",
              collapsed && "md:hidden",
            )}
          >
            Workspace
          </p>
          {DASHBOARD_NAV.map((item) => {
            const Icon = iconMap[item.icon];
            const active = isActive(item.href);
            const link = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex h-9.5 items-center gap-3 rounded-lg px-3 text-[12.5px] font-medium transition-all duration-200",
                  collapsed && "md:justify-center md:px-0",
                  active
                    ? "bg-accent-soft text-foreground"
                    : "text-muted hover:bg-white/[0.04] hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                {active ? (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-bright"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                ) : null}
                <Icon
                  className={cn(
                    "size-[16px] shrink-0 transition-colors",
                    active ? "text-accent-bright" : "text-subtle group-hover:text-muted",
                  )}
                />
                <span className={cn("truncate", collapsed && "md:hidden")}>{item.label}</span>
                {item.label === "AI Workspace" ? (
                  <Sparkles
                    className={cn(
                      "ml-auto size-3 text-accent/50",
                      collapsed && "md:hidden",
                    )}
                  />
                ) : null}
              </Link>
            );

            return collapsed ? (
              <Tooltip key={item.href} label={item.label} side="right" className="md:block">
                {link}
              </Tooltip>
            ) : (
              <div key={item.href}>{link}</div>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <div className="mb-2 space-y-1">
            <Tooltip label={theme === "midnight" ? "Switch to dim theme" : "Switch to midnight theme"} side="right">
              <button
                type="button"
                onClick={cycleTheme}
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[12px] text-muted transition hover:bg-white/[0.04] hover:text-foreground",
                  collapsed && "md:justify-center md:px-0",
                )}
              >
                {theme === "midnight" ? <Moon className="size-4 shrink-0" /> : <Sun className="size-4 shrink-0" />}
                <span className={collapsed ? "md:hidden" : ""}>
                  {theme === "midnight" ? "Midnight theme" : "Dim theme"}
                </span>
              </button>
            </Tooltip>
            <Tooltip label="Help & support" side="right">
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[12px] text-muted transition hover:bg-white/[0.04] hover:text-foreground",
                  collapsed && "md:justify-center md:px-0",
                )}
              >
                <LifeBuoy className="size-4 shrink-0" />
                <span className={collapsed ? "md:hidden" : ""}>Help & support</span>
              </button>
            </Tooltip>
          </div>

          <Dropdown
            trigger={
              <div
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border border-line bg-white/[0.025] p-2.5 text-left transition hover:border-line-strong hover:bg-white/[0.045]",
                  collapsed && "md:justify-center md:border-transparent md:bg-transparent md:p-1",
                )}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(145deg,#3b3760,#26233e)] text-[10px] font-semibold text-[#d4ccff] ring-1 ring-white/10">
                  AM
                </div>
                <div className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
                  <p className="truncate text-[12px] font-medium text-foreground">Alex Morgan</p>
                  <p className="truncate text-[10px] text-subtle">Demo workspace</p>
                </div>
                <ChevronRight
                  className={cn("size-3.5 shrink-0 text-subtle", collapsed && "md:hidden")}
                />
              </div>
            }
            align="left"
            className="w-full"
            contentClassName="bottom-full top-auto mb-2 mt-0 w-60"
          >
            {(close) => (
              <>
                <div className="mb-1 border-b border-line px-2.5 py-2">
                  <p className="text-[12px] font-medium text-foreground">Alex Morgan</p>
                  <p className="text-[10.5px] text-subtle">alex@documind.demo</p>
                </div>
                <DropdownItem
                  icon={<User />}
                  onClick={() => {
                    close();
                    router.push("/dashboard/settings?tab=general");
                  }}
                >
                  Profile settings
                </DropdownItem>
                <DropdownItem
                  icon={<Palette />}
                  onClick={() => {
                    close();
                    router.push("/dashboard/settings?tab=general");
                  }}
                >
                  Appearance
                </DropdownItem>
                <DropdownItem
                  icon={<LogOut />}
                  danger
                  onClick={() => {
                    close();
                    toast({
                      title: "Demo session closed",
                      description: "Authentication will be implemented in Phase 2.",
                      tone: "info",
                    });
                    router.push("/");
                  }}
                >
                  Exit demo
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      </aside>

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Help & support"
        description="Find your way around the DocuMind AI demo environment."
        size="lg"
      >
        <div className="grid gap-3 p-6 sm:grid-cols-2">
          <Link
            href="/#documentation"
            onClick={() => setHelpOpen(false)}
            className="group rounded-xl border border-line bg-white/[0.02] p-4 transition hover:border-accent/25 hover:bg-accent/[0.035]"
          >
            <BookOpen className="size-5 text-accent-bright" />
            <p className="mt-3 text-[13px] font-medium text-foreground">Read the documentation</p>
            <p className="mt-1 text-[11.5px] leading-5 text-muted">
              Explore the product architecture, workflow, and intended API contracts.
            </p>
          </Link>
          <Link
            href="/dashboard/health"
            onClick={() => setHelpOpen(false)}
            className="group rounded-xl border border-line bg-white/[0.02] p-4 transition hover:border-accent/25 hover:bg-accent/[0.035]"
          >
            <Activity className="size-5 text-accent-bright" />
            <p className="mt-3 text-[13px] font-medium text-foreground">Check integration status</p>
            <p className="mt-1 text-[11.5px] leading-5 text-muted">
              See which services are operational, demo-only, or awaiting backend integration.
            </p>
          </Link>
          <div className="rounded-xl border border-line bg-white/[0.02] p-4 sm:col-span-2">
            <p className="text-[12px] font-medium text-foreground">Phase 5 integration note</p>
            <p className="mt-1.5 text-[11.5px] leading-5 text-muted">
              Documents are processed, embedded with Gemini, and indexed in FAISS. The LangGraph
              agent returns grounded answers with validated citations when a Gemini key is configured.
            </p>
            <button
              type="button"
              onClick={() => {
                setHelpOpen(false);
                toast({
                  title: "Support request simulated",
                  description: "A real support channel will be connected after backend integration.",
                  tone: "info",
                });
              }}
              className="mt-3 text-[11.5px] font-medium text-accent-bright transition hover:text-foreground"
            >
              Contact demo support
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
