import { apiRequest } from "@/lib/api/client";

export type IntegrationStatus =
  | "OPERATIONAL"
  | "PROCESSING"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "AWAITING_INTEGRATION"
  | "NOT_IMPLEMENTED"
  | "UNKNOWN";

export interface ComponentHealth {
  name: string;
  status: IntegrationStatus;
  detail: string;
  latencyMs?: number;
}

export interface SystemStatus {
  status: "ok" | "degraded" | "unavailable";
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  components: ComponentHealth[];
}

export interface SystemOverview {
  status: "operational" | "degraded" | "unavailable";
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  nextPhase: string;
  components: ComponentHealth[];
}

interface ApiComponentHealth {
  name: string;
  status: IntegrationStatus;
  detail: string;
  latency_ms?: number | null;
}

interface ApiHealth {
  success: true;
  status: "ok" | "degraded" | "unavailable";
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptime_seconds: number;
  components: ApiComponentHealth[];
}

interface ApiSystemOverview {
  success: true;
  status: "operational" | "degraded" | "unavailable";
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  next_phase: string;
  components: ApiComponentHealth[];
}

function mapComponent(component: ApiComponentHealth): ComponentHealth {
  return {
    name: component.name,
    status: component.status,
    detail: component.detail,
    latencyMs: component.latency_ms ?? undefined,
  };
}

export async function getSystemHealth(): Promise<SystemStatus> {
  const response = await apiRequest<ApiHealth>("/health");
  return {
    status: response.status,
    service: response.service,
    version: response.version,
    environment: response.environment,
    timestamp: response.timestamp,
    uptimeSeconds: response.uptime_seconds,
    components: response.components.map(mapComponent),
  };
}

export async function getSystemOverview(): Promise<SystemOverview> {
  const response = await apiRequest<ApiSystemOverview>("/system/status");
  return {
    status: response.status,
    service: response.service,
    version: response.version,
    environment: response.environment,
    timestamp: response.timestamp,
    nextPhase: response.next_phase,
    components: response.components.map(mapComponent),
  };
}
