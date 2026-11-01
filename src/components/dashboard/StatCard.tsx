import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down" | "neutral";
  icon: LucideIcon;
  sparkline: number[];
  accent?: "violet" | "cyan" | "green" | "amber";
  badge?: string;
}

const accentMap = {
  violet: {
    icon: "border-accent/20 bg-accent-soft text-accent-bright",
    stroke: "#a99bff",
    fill: "rgba(139,125,251,0.12)",
  },
  cyan: {
    icon: "border-cyan/20 bg-cyan/[0.08] text-cyan",
    stroke: "#7dd3fc",
    fill: "rgba(125,211,252,0.1)",
  },
  green: {
    icon: "border-success/20 bg-success/[0.08] text-success",
    stroke: "#5bd6a5",
    fill: "rgba(91,214,165,0.1)",
  },
  amber: {
    icon: "border-warning/20 bg-warning/[0.08] text-warning",
    stroke: "#e9bd70",
    fill: "rgba(233,189,112,0.1)",
  },
};

export function StatCard({
  label,
  value,
  change,
  trend,
  icon: Icon,
  sparkline,
  accent = "violet",
  badge = "Demo",
}: StatCardProps) {
  const colors = accentMap[accent];
  const max = Math.max(...sparkline);
  const min = Math.min(...sparkline);
  const range = max - min || 1;
  const points = sparkline
    .map((point, index) => {
      const x = (index / (sparkline.length - 1)) * 100;
      const y = 30 - ((point - min) / range) * 24;
      return `${x},${y}`;
    })
    .join(" ");
  const areaPoints = `0,34 ${points} 100,34`;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-line bg-surface/75 p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("flex size-7 items-center justify-center rounded-lg border", colors.icon)}>
            <Icon className="size-3.5" />
          </span>
          <span className="text-[10.5px] font-medium text-muted">{label}</span>
        </div>
          <span className="flex items-center gap-1 rounded-full border border-line bg-white/[0.025] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-subtle">
            {badge}
          </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[25px] font-semibold leading-none tracking-[-0.035em] text-foreground">
            {value}
          </p>
          <div
            className={cn(
              "mt-2 flex items-center gap-1 text-[9.5px]",
              trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-subtle",
            )}
          >
            {trend === "up" ? (
              <ArrowUpRight className="size-2.5" />
            ) : trend === "down" ? (
              <ArrowDownRight className="size-2.5" />
            ) : null}
            {change}
          </div>
        </div>
        <svg
          viewBox="0 0 100 34"
          className="h-8 w-20 shrink-0 overflow-visible"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon points={areaPoints} fill={colors.fill} />
          <polyline
            points={points}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  );
}
