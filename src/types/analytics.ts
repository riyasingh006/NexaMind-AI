export type AnalyticsRange = "7d" | "30d" | "90d";

export interface QueryActivityPoint {
  label: string;
  queries: number;
  successful: number;
}

export interface LatencyPoint {
  label: string;
  retrieval: number;
  response: number;
}

export interface IngestionPoint {
  name: string;
  value: number;
  color: string;
}

export interface RetrievalInspection {
  id: string;
  query: string;
  chunk: string;
  document: string;
  page: number;
  similarity: number;
  rerankPosition: number;
  timestamp: string;
  latencyMs: number;
}

export interface AnalyticsDataset {
  queryActivity: QueryActivityPoint[];
  latency: LatencyPoint[];
  ingestion: IngestionPoint[];
  inspections: RetrievalInspection[];
  metrics: {
    totalQueries: number;
    successRate: number;
    avgRetrievalLatency: number;
    avgResponseLatency: number;
    indexedChunks: number;
    documentsIngested: number;
  };
}
