"use client";

import {
  ArrowRight,
  Braces,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Cylinder,
  Database,
  Info,
  Monitor,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { PageHeading, Panel } from "@/components/ui/PageHeading";
import {
  getSystemOverview,
  type IntegrationStatus,
  type SystemOverview,
} from "@/lib/api/system";
import { SYSTEM_SERVICES } from "@/lib/constants";
import { cn, formatDateTime } from "@/lib/utils";

const serviceIcons: Record<string, LucideIcon> = {
  monitor: Monitor,
  server: Server,
  sparkles: Sparkles,
  braces: Braces,
  database: Database,
  cylinder: Cylinder,
  workflow: Workflow,
};

const serviceComponentMap: Record<string, string> = {
  "Backend API": "api",
  Database: "database",
  "Gemini API": "gemini",
  "Embedding Service": "embeddings",
  "FAISS Index": "vector_index",
  "LangGraph Workflow": "orchestration",
};

const statusStyles: Record<
  IntegrationStatus,
  { dot: string; badge: "success" | "warning" | "danger" | "muted" | "accent"; label: string }
> = {
  OPERATIONAL: { dot: "bg-success", badge: "success", label: "Operational" },
  PROCESSING: { dot: "bg-accent-bright", badge: "accent", label: "Processing" },
  DEGRADED: { dot: "bg-warning", badge: "warning", label: "Degraded" },
  UNAVAILABLE: { dot: "bg-danger", badge: "danger", label: "Unavailable" },
  NOT_CONFIGURED: { dot: "bg-subtle", badge: "muted", label: "Not configured" },
  AWAITING_INTEGRATION: { dot: "bg-warning", badge: "warning", label: "Awaiting build" },
  NOT_IMPLEMENTED: { dot: "bg-subtle", badge: "muted", label: "Not implemented" },
  UNKNOWN: { dot: "bg-subtle", badge: "muted", label: "Not measured" },
};

type ReadinessState = "ready" | "pending" | "blocked" | "unknown";

const stateStyles: Record<
  ReadinessState,
  {
    badge: "success" | "warning" | "danger" | "muted";
    icon: LucideIcon;
    label: string;
    text: string;
  }
> = {
  ready: {
    badge: "success",
    icon: CheckCircle2,
    label: "Ready",
    text: "text-success",
  },
  pending: {
    badge: "warning",
    icon: Clock3,
    label: "Pending",
    text: "text-warning",
  },
  blocked: {
    badge: "danger",
    icon: ShieldAlert,
    label: "Blocked",
    text: "text-[#ff9aaa]",
  },
  unknown: {
    badge: "muted",
    icon: CircleDashed,
    label: "Not measured",
    text: "text-subtle",
  },
};

interface ReadinessItem {
  area: string;
  phase: string;
  state: ReadinessState;
  detail: string;
}

function componentStatus(overview: SystemOverview | null, name: string): IntegrationStatus {
  return overview?.components.find((component) => component.name === name)?.status ?? "UNKNOWN";
}

function readinessForStatus(status: IntegrationStatus): ReadinessState {
  if (status === "OPERATIONAL") return "ready";
  if (
    status === "PROCESSING" ||
    status === "AWAITING_INTEGRATION"
  ) {
    return "pending";
  }
  if (status === "UNKNOWN") return "unknown";
  return "blocked";
}

function componentDetail(
  overview: SystemOverview | null,
  name: string,
  unavailableDetail: string,
): string {
  return overview?.components.find((component) => component.name === name)?.detail ?? unavailableDetail;
}

function buildReadiness(overview: SystemOverview | null): ReadinessItem[] {
  const api = componentStatus(overview, "api");
  const database = componentStatus(overview, "database");
  const gemini = componentStatus(overview, "gemini");
  const embeddings = componentStatus(overview, "embeddings");
  const vectorIndex = componentStatus(overview, "vector_index");
  const pipeline = componentStatus(overview, "document_pipeline");
  const orchestration = componentStatus(overview, "orchestration");
  const chatDependencies = [api, database, pipeline, gemini, embeddings, vectorIndex, orchestration]
    .map(readinessForStatus);
  const chatState = chatDependencies.includes("unknown")
    ? "unknown"
    : chatDependencies.includes("blocked")
      ? "blocked"
      : chatDependencies.includes("pending")
        ? "pending"
        : "ready";
  const healthUnavailable = overview
    ? "Backend health did not report this component; its state cannot be verified."
    : "Backend health was not received; this component cannot be verified.";

  return [
    {
      area: "Frontend application shell",
      phase: "Phase 1",
      state: "ready",
      detail: "Responsive routes and UI are running.",
    },
    {
      area: "FastAPI backend",
      phase: "Phase 2",
      state: readinessForStatus(api),
      detail: componentDetail(overview, "api", healthUnavailable),
    },
    {
      area: "Document ingestion pipeline",
      phase: "Phase 3",
      state: readinessForStatus(pipeline),
      detail: componentDetail(overview, "document_pipeline", healthUnavailable),
    },
    {
      area: "Gemini credentials",
      phase: "Phase 4",
      state: readinessForStatus(gemini),
      detail: componentDetail(overview, "gemini", healthUnavailable),
    },
    {
      area: "Embedding pipeline",
      phase: "Phase 4",
      state: readinessForStatus(embeddings),
      detail: componentDetail(overview, "embeddings", healthUnavailable),
    },
    {
      area: "FAISS vector index",
      phase: "Phase 4",
      state: readinessForStatus(vectorIndex),
      detail: componentDetail(overview, "vector_index", healthUnavailable),
    },
    {
      area: "LangGraph orchestration",
      phase: "Phase 5",
      state: readinessForStatus(orchestration),
      detail: componentDetail(overview, "orchestration", healthUnavailable),
    },
    {
      area: "Grounded chat interface",
      phase: "Phase 5",
      state: chatState,
      detail: "Requires a reachable API, configured Gemini, and indexed evidence.",
    },
    {
      area: "Conversation persistence",
      phase: "Phase 5",
      state: readinessForStatus(database),
      detail: componentDetail(overview, "database", healthUnavailable),
    },
  ];
}

export default function HealthPage() {
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await getSystemOverview();
      setOverview(response);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load system status.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadStatus(true);
  }, []);

  const readiness = useMemo(() => buildReadiness(overview), [overview]);
  const componentMap = useMemo(
    () => new Map(overview?.components.map((component) => [component.name, component]) ?? []),
    [overview],
  );
  const healthContract = useMemo(() => {
    if (!overview) return "System status has not been loaded.";
    return JSON.stringify(
      {
        status: overview.status,
        components: Object.fromEntries(
          overview.components.map((component) => [component.name, component.status]),
        ),
      },
      null,
      2,
    );
  }, [overview]);

  const gemini = componentMap.get("gemini");
  const vector = componentMap.get("vector_index");
  const database = componentMap.get("database");
  const overallStatus = overview?.status ?? "unavailable";
  const overallMeta =
    overallStatus === "operational"
      ? {
          badge: "success" as const,
          icon: CheckCircle2,
          title: "System operational",
          description:
            "The backend and persistence layer are responding. AI and vector services report their own live state below.",
        }
      : overallStatus === "degraded"
        ? {
            badge: "warning" as const,
            icon: ShieldAlert,
            title: "System degraded",
            description:
              "The API is responding, but one or more runtime dependencies are unavailable or unconfigured.",
          }
        : {
            badge: "danger" as const,
            icon: ShieldAlert,
            title: "System unavailable",
            description:
              error ?? "The backend status endpoint could not be reached.",
          };
  const OverallIcon = overallMeta.icon;

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="Live integration readiness"
        title="System Health"
        description="Measured directly from the backend health contract. Component states reflect configured credentials, the persisted FAISS index and the document pipeline."
        actions={
          <>
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-white/[0.04] px-3 text-[11.5px] font-medium text-foreground transition hover:bg-white/[0.07] disabled:opacity-60"
              disabled={refreshing || loading}
            >
              <RefreshCw className={cn("size-3.5", (refreshing || loading) && "animate-spin")} />
              Refresh status
            </button>
            <Link
              href="/dashboard/settings"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-[11.5px] font-medium text-white shadow-[0_8px_22px_-8px_rgba(139,125,251,0.65)] transition hover:bg-[#9b8eff]"
            >
              Open settings
              <ArrowRight className="size-3.5" />
            </Link>
          </>
        }
      />

      {error ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger/[0.06] px-3.5 py-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#ff9aaa]" />
          <div>
            <p className="text-[11px] font-medium text-[#ff9aaa]">
              Backend status request failed
            </p>
            <p className="mt-0.5 text-[10px] leading-5 text-muted">{error}</p>
          </div>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface/80">
        <div className="pointer-events-none absolute right-0 top-0 size-72 bg-[radial-gradient(circle,rgba(91,214,165,0.08),transparent_68%)]" />
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl border",
                overallStatus === "operational"
                  ? "border-success/20 bg-success/[0.07] text-success"
                  : overallStatus === "degraded"
                    ? "border-warning/20 bg-warning/[0.07] text-warning"
                    : "border-danger/20 bg-danger/[0.07] text-[#ff9aaa]",
              )}
            >
              <OverallIcon className="size-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold text-foreground">
                  {loading ? "Loading system status..." : overallMeta.title}
                </h2>
                <Badge tone={overallMeta.badge} dot>
                  {overview ? `${overview.service} ${overview.version}` : "No response"}
                </Badge>
              </div>
              <p className="mt-1 max-w-xl text-[10.5px] leading-5 text-muted">
                {overallMeta.description}
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg border border-line bg-white/[0.025] px-3 py-2 text-left sm:text-right">
            <p className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-subtle">
              Last measured
            </p>
            <p className="mt-0.5 text-[10px] text-muted">
              {overview ? formatDateTime(overview.timestamp) : "Not available"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SYSTEM_SERVICES.map((service) => {
          const Icon = serviceIcons[service.icon] ?? CircleDashed;
          const componentName = serviceComponentMap[service.name];
          const component = componentName ? componentMap.get(componentName) : undefined;
          const status: IntegrationStatus =
            service.name === "Frontend"
              ? "OPERATIONAL"
              : component?.status ?? (loading ? "PROCESSING" : "UNAVAILABLE");
          const style = statusStyles[status];
          const note =
            service.name === "Frontend"
              ? "This Next.js interface is running and rendering live backend status."
              : component?.detail ??
                (loading
                  ? "Waiting for the backend health response."
                  : "This component was not reported by the backend.");
          return (
            <div
              key={service.name}
              className="group rounded-xl border border-line bg-surface/75 p-4 transition hover:border-line-strong"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg border border-line bg-white/[0.03] text-muted transition group-hover:text-foreground">
                  <Icon className="size-4" />
                </span>
                <span className={cn("mt-1 size-1.5 rounded-full", style.dot)} />
              </div>
              <h3 className="mt-3 text-[11.5px] font-medium text-foreground">{service.name}</h3>
              <p className="mt-1 min-h-[30px] text-[9px] leading-4 text-subtle">
                {service.description}
              </p>
              <div className="mt-3 border-t border-line/60 pt-2.5">
                <Badge tone={style.badge} className="text-[8.5px]">
                  {style.label}
                </Badge>
                <p className="mt-2 text-[8.5px] leading-4 text-subtle">{note}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <Panel
          title="Integration readiness"
          description="Phase 5 is complete in code. Live generation depends on Gemini credentials and indexed evidence."
          action={<Badge tone="accent">Phase 5 status</Badge>}
        >
          <div className="divide-y divide-line/60">
            {readiness.map((item) => {
              const style = stateStyles[item.state];
              const Icon = style.icon;
              return (
                <div key={item.area} className="flex items-start gap-3 px-5 py-3">
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", style.text)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10.5px] font-medium text-foreground/90">{item.area}</p>
                      <span className="rounded border border-line px-1 py-px font-mono text-[7px] uppercase tracking-wide text-subtle">
                        {item.phase}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[8.5px] text-subtle">{item.detail}</p>
                  </div>
                  <Badge tone={style.badge} className="shrink-0 text-[8px]">
                    {style.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Environment" description="Measured runtime facts.">
            <dl className="divide-y divide-line/60">
              {[
                ["Application", "Next.js 16 - App Router"],
                ["Environment", overview?.environment ?? "Unknown"],
                ["Data source", "Document, retrieval, chat and analytics APIs"],
                [
                  "API base URL",
                  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1",
                ],
                ["Gemini API key", gemini ? statusStyles[gemini.status].label : "Unknown"],
                ["Vector index", vector ? statusStyles[vector.status].label : "Unknown"],
                ["Database", database ? statusStyles[database.status].label : "Unknown"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <dt className="text-[9.5px] text-subtle">{label}</dt>
                  <dd className="max-w-[190px] truncate text-right text-[9.5px] font-medium text-muted">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          <div className="rounded-xl border border-accent/15 bg-accent/[0.035] p-4">
            <div className="flex items-center gap-2">
              <Info className="size-3.5 text-accent-bright/80" />
              <p className="text-[10.5px] font-medium text-foreground">Backend health contract</p>
            </div>
            <p className="mt-1.5 text-[8.5px] leading-4 text-subtle">
              Polled live from <code>/api/v1/system/status</code>. The block below is the current
              response, not sample data.
            </p>
            <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-line bg-[#070910] p-3 font-mono text-[8.5px] leading-4 text-muted">
              {healthContract}
            </pre>
            <p className="mt-2 font-mono text-[7.5px] uppercase tracking-[0.12em] text-subtle/60">
              GET /api/v1/system/status
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3.5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-2">
          <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-subtle" />
          <p className="text-[9.5px] leading-4 text-subtle">
            {overview?.nextPhase ??
              "Next phase details will appear when the backend status request succeeds."}
          </p>
        </div>
        <Link
          href="/dashboard/retrieval"
          className="inline-flex items-center gap-1 text-[9.5px] font-medium text-accent-bright transition hover:text-foreground"
        >
          Test vector retrieval
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
