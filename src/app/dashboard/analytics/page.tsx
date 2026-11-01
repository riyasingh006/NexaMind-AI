"use client";

import {
  Activity,
  ArrowUpRight,
  Download,
  Eye,
  Gauge,
  Info,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "@/components/dashboard/StatCard";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { PageHeading, Panel } from "@/components/ui/PageHeading";
import { getAnalytics } from "@/lib/mock-data";
import { cn, downloadTextFile, formatDateTime, formatNumber } from "@/lib/utils";
import type { AnalyticsRange, RetrievalInspection } from "@/types/analytics";

const ranges: { value: AnalyticsRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

const tooltipStyle = {
  backgroundColor: "#111421",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "10px",
  color: "#f4f3f8",
  fontSize: "11px",
  boxShadow: "0 12px 36px rgba(0,0,0,0.45)",
};

const axisTick = { fill: "#70758a", fontSize: 9 };

export default function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [inspection, setInspection] = useState<RetrievalInspection | null>(null);
  const { toast } = useToast();
  const data = useMemo(() => getAnalytics(range), [range]);

  const querySparkline = data.queryActivity.map((point) => point.queries);
  const successSparkline = data.queryActivity.map((point) =>
    Math.round((point.successful / point.queries) * 100),
  );
  const retrievalSparkline = data.latency.map((point) => point.retrieval);
  const responseSparkline = data.latency.map((point) => point.response);

  const exportAnalytics = () => {
    const rows = [
      ["Period", "Query Activity"],
      ...data.queryActivity.map((point) => [point.label, String(point.queries)]),
      [],
      ["Metric", "Value"],
      ["Total queries", String(data.metrics.totalQueries)],
      ["Success rate", `${data.metrics.successRate}%`],
      ["Average retrieval latency", `${data.metrics.avgRetrievalLatency}ms`],
      ["Average response latency", `${data.metrics.avgResponseLatency}ms`],
      ["Indexed chunks", String(data.metrics.indexedChunks)],
      ["Documents ingested", String(data.metrics.documentsIngested)],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell ?? ""}"`).join(",")).join("\n");
    downloadTextFile(`documind-analytics-${range}.csv`, csv);
    toast({
      title: "Analytics exported",
      description: `Demo metrics for the ${range} window were downloaded as CSV.`,
      tone: "success",
    });
  };

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="Retrieval intelligence"
        title="Retrieval Analytics"
        description="Inspect illustrative query analytics and ingestion composition. Use the Retrieval workspace for real Gemini embeddings and FAISS searches."
        actions={
          <>
            <button
              type="button"
              onClick={exportAnalytics}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-white/[0.04] px-3 text-[11.5px] font-medium text-foreground transition hover:bg-white/[0.07]"
            >
              <Download className="size-3.5" />
              Export CSV
            </button>
            <div className="flex items-center rounded-lg border border-line bg-white/[0.025] p-0.5">
              {ranges.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setRange(item.value)}
                  className={cn(
                    "h-7.5 rounded-md px-2.5 text-[10px] font-medium transition",
                    range === item.value
                      ? "bg-white/[0.09] text-foreground shadow-sm"
                      : "text-subtle hover:text-muted",
                  )}
                  aria-pressed={range === item.value}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-warning/12 bg-warning/[0.035] px-3.5 py-2.5">
        <Info className="mt-0.5 size-3.5 shrink-0 text-warning/70" />
        <p className="text-[10.5px] leading-5 text-muted">
          The charts on this page remain illustrative frontend data. Real semantic retrieval is
          available in the Retrieval workspace and uses Gemini query embeddings plus the
          persistent FAISS index.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total queries"
          value={formatNumber(data.metrics.totalQueries)}
          change={`${range} demo window`}
          trend="neutral"
          icon={MessageSquare}
          sparkline={querySparkline}
          accent="violet"
        />
        <StatCard
          label="Success rate"
          value={`${data.metrics.successRate}%`}
          change={`${range} simulated average`}
          trend="neutral"
          icon={ShieldCheck}
          sparkline={successSparkline}
          accent="green"
        />
        <StatCard
          label="Avg retrieval"
          value={`${data.metrics.avgRetrievalLatency}ms`}
          change="Illustrative Top-K latency"
          trend="neutral"
          icon={Gauge}
          sparkline={retrievalSparkline}
          accent="cyan"
        />
        <StatCard
          label="Avg response"
          value={`${(data.metrics.avgResponseLatency / 1000).toFixed(1)}s`}
          change="Simulated synthesis time"
          trend="neutral"
          icon={Timer}
          sparkline={responseSparkline}
          accent="amber"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)]">
        <Panel
          title="Query activity"
          description={`Successful vs total simulated questions over the selected ${range} range.`}
          action={
            <Badge tone="accent" dot>
              Demo telemetry
            </Badge>
          }
        >
          <div className="flex flex-wrap items-center gap-4 px-5 pt-4 text-[9px] text-subtle">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#8b7dfb]" />
              Total queries
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#5bd6a5]" />
              Successful
            </span>
            <span className="ml-auto font-mono text-[8px] text-subtle/60">
              ∑ {formatNumber(data.metrics.totalQueries)} queries
            </span>
          </div>
          <div className="h-[270px] px-2 pb-3 pt-4 sm:px-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.queryActivity} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="queriesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b7dfb" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#8b7dfb" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="successFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5bd6a5" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="#5bd6a5" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.055)" strokeDasharray="3 4" />
                <XAxis
                  dataKey="label"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} />
                <RechartsTooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
                <Area
                  type="monotone"
                  dataKey="queries"
                  name="Total queries"
                  stroke="#8b7dfb"
                  strokeWidth={1.8}
                  fill="url(#queriesFill)"
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="successful"
                  name="Successful"
                  stroke="#5bd6a5"
                  strokeWidth={1.4}
                  fill="url(#successFill)"
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Ingestion mix"
          description="Illustrative chunks by source format."
          action={<LayersIcon />}
        >
          <div className="p-5">
            <div className="relative mx-auto h-[180px] max-w-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.ingestion}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={78}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {data.ingestion.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[22px] font-semibold tracking-[-0.04em] text-foreground">
                  {formatNumber(data.metrics.indexedChunks)}
                </span>
                <span className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-subtle">
                  chunks
                </span>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {data.ingestion.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 text-[10px]">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="flex-1 text-muted">{entry.name}</span>
                  <span className="font-mono text-[9.5px] text-foreground">{entry.value}</span>
                  <span className="w-9 text-right font-mono text-[8.5px] text-subtle">
                    {Math.round((entry.value / data.ingestion.reduce((sum, item) => sum + item.value, 0)) * 100)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-line pt-3 text-[8.5px] text-subtle">
              {data.metrics.documentsIngested} documents ingested in this window.
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Retrieval latency"
        description="Retrieval and end-to-end response latency are shown on separate axes."
        action={<Activity className="size-3.5 text-subtle" />}
      >
        <div className="flex flex-wrap items-center gap-4 px-5 pt-4 text-[9px] text-subtle">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[#9b8dff]" />
            Retrieval (ms)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[#7dd3fc]" />
            Response (ms)
          </span>
          <span className="ml-auto rounded border border-line bg-white/[0.025] px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-wide text-subtle">
            Demo only
          </span>
        </div>
        <div className="h-[230px] px-2 pb-3 pt-4 sm:px-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.latency} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="retrievalFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9b8dff" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#9b8dff" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.055)" strokeDasharray="3 4" />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis
                yAxisId="left"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={44}
                unit="ms"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={44}
                unit="ms"
              />
              <RechartsTooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="retrieval"
                name="Retrieval"
                stroke="#9b8dff"
                strokeWidth={1.7}
                fill="url(#retrievalFill)"
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="response"
                name="Response"
                stroke="#7dd3fc"
                strokeWidth={1.4}
                fill="transparent"
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel
        title="Retrieval inspections"
        description="Simulated evidence traces showing why a chunk was surfaced."
        action={
          <span className="flex items-center gap-1 text-[8.5px] text-subtle">
            <Sparkles className="size-3 text-accent-bright/60" />
            {data.inspections.length} traces
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-line text-[8px] uppercase tracking-[0.12em] text-subtle">
                <th className="px-5 py-2.5 font-medium">Query</th>
                <th className="px-3 py-2.5 font-medium">Document</th>
                <th className="px-3 py-2.5 font-medium">Page</th>
                <th className="px-3 py-2.5 font-medium">Similarity</th>
                <th className="px-3 py-2.5 font-medium">Rank</th>
                <th className="px-3 py-2.5 font-medium">Latency</th>
                <th className="px-5 py-2.5 text-right font-medium">Trace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {data.inspections.map((item) => (
                <tr key={item.id} className="group transition hover:bg-white/[0.018]">
                  <td className="max-w-[260px] px-5 py-3">
                    <p className="truncate text-[10.5px] text-foreground/90">{item.query}</p>
                    <p className="mt-0.5 text-[8px] text-subtle">{formatDateTime(item.timestamp)}</p>
                  </td>
                  <td className="max-w-[180px] px-3 py-3">
                    <p className="truncate text-[9.5px] text-muted">{item.document}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-[9px] text-subtle">{item.page}</td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-[9.5px] text-success">
                      {(item.similarity * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[8px] text-subtle">
                      #{item.rerankPosition}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-[9px] text-muted">{item.latencyMs}ms</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setInspection(item)}
                      className="inline-flex size-7 items-center justify-center rounded-md border border-line text-subtle transition hover:border-accent/25 hover:bg-accent-soft hover:text-accent-bright"
                      aria-label={`Inspect retrieval for ${item.query}`}
                    >
                      <Eye className="size-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-2.5">
          <span className="text-[8.5px] text-subtle">Showing all illustrative retrieval traces.</span>
          <span className="flex items-center gap-1 font-mono text-[8px] text-subtle/60">
            <ArrowUpRight className="size-2.5" />
            Phase 2 will stream live traces
          </span>
        </div>
      </Panel>

      <Modal
        open={Boolean(inspection)}
        onClose={() => setInspection(null)}
        title="Retrieval inspection"
        description="Illustrative evidence trace from the local demo dataset."
        size="lg"
      >
        {inspection ? (
          <div className="space-y-5 p-6">
            <div>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-subtle">Query</p>
              <p className="mt-1.5 text-[13px] leading-5 text-foreground">{inspection.query}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Similarity", value: `${(inspection.similarity * 100).toFixed(0)}%` },
                { label: "Rerank", value: `#${inspection.rerankPosition}` },
                { label: "Latency", value: `${inspection.latencyMs}ms` },
                { label: "Page", value: String(inspection.page) },
              ].map((metric) => (
                <div key={metric.label} className="rounded-lg border border-line bg-white/[0.025] p-3">
                  <p className="text-[8px] uppercase tracking-[0.1em] text-subtle">{metric.label}</p>
                  <p className="mt-1 font-mono text-[12px] text-foreground">{metric.value}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-subtle">Source</p>
              <p className="mt-1.5 text-[11.5px] text-muted">
                {inspection.document} · page {inspection.page}
              </p>
            </div>
            <div>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-subtle">
                Retrieved chunk
              </p>
              <blockquote className="mt-2 rounded-xl border border-line bg-[#080a12] p-4 text-[11.5px] leading-6 text-muted">
                {inspection.chunk}
              </blockquote>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-warning/12 bg-warning/[0.035] p-3 text-[9px] leading-5 text-warning/70">
              <Info className="mt-0.5 size-3 shrink-0" />
              This trace is static mock data for interface evaluation. No vector search was performed.
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function LayersIcon() {
  return (
    <span className="flex size-6 items-center justify-center rounded-md border border-line bg-white/[0.025] text-subtle">
      <span className="size-2.5 rounded-sm border border-current" />
    </span>
  );
}
