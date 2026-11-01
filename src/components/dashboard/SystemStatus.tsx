"use client";

import { ArrowRight, Braces, Cpu, Database, RefreshCw, Server, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSystemOverview, type SystemOverview } from "@/lib/api/system";
import { cn } from "@/lib/utils";

const toneMap = {
  success: { dot: "bg-success", text: "text-success" },
  danger: { dot: "bg-danger", text: "text-[#ff9aaa]" },
  muted: { dot: "bg-subtle", text: "text-subtle" },
  accent: { dot: "bg-accent-bright", text: "text-accent-bright" },
  warning: { dot: "bg-warning", text: "text-warning" },
};

const statusMeta = {
  OPERATIONAL: { label: "Operational", tone: "success" },
  PROCESSING: { label: "Processing", tone: "accent" },
  DEGRADED: { label: "Degraded", tone: "warning" },
  UNAVAILABLE: { label: "Unavailable", tone: "danger" },
  NOT_CONFIGURED: { label: "Not configured", tone: "muted" },
  AWAITING_INTEGRATION: { label: "Awaiting build", tone: "warning" },
  NOT_IMPLEMENTED: { label: "Not implemented", tone: "muted" },
  UNKNOWN: { label: "Not measured", tone: "muted" },
} as const;

const baseServices = [
  { name: "Frontend", detail: "Next.js UI", icon: Cpu, component: null, fallback: "OPERATIONAL" },
  { name: "Backend", detail: "FastAPI", icon: Server, component: "api", fallback: "UNKNOWN" },
  { name: "Database", detail: "SQLAlchemy", icon: Database, component: "database", fallback: "UNKNOWN" },
  { name: "Gemini API", detail: "Credentials", icon: Sparkles, component: "gemini", fallback: "UNKNOWN" },
  {
    name: "Embeddings",
    detail: "gemini-embedding-001",
    icon: Braces,
    component: "embeddings",
    fallback: "UNKNOWN",
  },
  {
    name: "Vector Index",
    detail: "Persistent FAISS",
    icon: Database,
    component: "vector_index",
    fallback: "UNKNOWN",
  },
] as const;

export function SystemStatus() {
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setOverview(await getSystemOverview());
    } catch {
      setOverview(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface/75">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
        <div>
          <h2 className="text-[12.5px] font-semibold text-foreground">System status</h2>
          <p className="mt-0.5 text-[10px] text-subtle">
            Live backend health contract, refreshed on page load
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex size-7 items-center justify-center rounded-md text-subtle transition hover:bg-white/5 hover:text-foreground"
          aria-label="Refresh system status"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
        </button>
      </div>
      <div className="divide-y divide-line/60">
        {baseServices.map((service) => {
          const Icon = service.icon;
          const component = overview?.components.find((item) => item.name === service.component);
          const status = component?.status ?? (loading ? "PROCESSING" : service.fallback);
          const meta = statusMeta[status];
          const tone = toneMap[meta.tone];
          const note = component?.detail ??
            (loading
              ? "Waiting for the backend health response."
              : overview
                ? "This component was not reported by the backend."
                : service.name === "Frontend"
                  ? service.detail
                  : "Backend status was not received; check the production API URL and CORS configuration.");
          return (
            <div key={service.name} className="flex items-center gap-3 px-4 py-2.5">
              <Icon className="size-3.5 shrink-0 text-subtle" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium text-foreground/90">
                  {service.name}
                </span>
                <span className="block truncate text-[9px] text-subtle">
                  {note}
                </span>
              </span>
              <span className={cn("flex items-center gap-1.5 text-[9.5px] font-medium", tone.text)}>
                <span className={cn("size-1.5 rounded-full", tone.dot)} />
                {loading && !overview ? "Checking" : meta.label}
              </span>
            </div>
          );
        })}
      </div>
      <Link
        href="/dashboard/health"
        className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[10px] font-medium text-accent-bright transition hover:bg-white/[0.025]"
      >
        View live integration details
        <ArrowRight className="size-3" />
      </Link>
    </section>
  );
}
