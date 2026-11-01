import { ArrowUpRight, BarChart3, FolderKanban, Sparkles, Upload } from "lucide-react";
import Link from "next/link";

const actions = [
  {
    label: "Upload documents",
    description: "Add PDF, TXT or Markdown",
    href: "/dashboard/documents?upload=1",
    icon: Upload,
  },
  {
    label: "Open AI workspace",
    description: "Ask across your sources",
    href: "/dashboard/chat",
    icon: Sparkles,
  },
  {
    label: "View analytics",
    description: "Inspect retrieval quality",
    href: "/dashboard/analytics",
    icon: BarChart3,
  },
  {
    label: "Manage knowledge",
    description: "Review the full library",
    href: "/dashboard/documents",
    icon: FolderKanban,
  },
];

export function QuickActions() {
  return (
    <section className="rounded-xl border border-line bg-surface/75 p-3">
      <div className="flex items-center justify-between px-1 pb-2.5 pt-1">
        <div>
          <h2 className="text-[12.5px] font-semibold text-foreground">Quick actions</h2>
          <p className="mt-0.5 text-[10px] text-subtle">Jump back into the workflow</p>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-subtle">04</span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className="group flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition hover:border-line hover:bg-white/[0.03]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white/[0.03] text-accent-bright/75 transition group-hover:border-accent/20 group-hover:bg-accent-soft group-hover:text-accent-bright">
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-medium text-foreground/90">
                  {action.label}
                </span>
                <span className="block text-[9.5px] text-subtle">{action.description}</span>
              </span>
              <ArrowUpRight className="size-3 text-subtle/50 transition group-hover:text-muted" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
