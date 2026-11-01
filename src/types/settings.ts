export type ThemePreference = "midnight" | "dim" | "system";

export interface WorkspaceSettings {
  workspaceName: string;
  displayName: string;
  email: string;
  theme: ThemePreference;
  geminiModel: string;
  embeddingModel: string;
  temperature: number;
  maxOutputTokens: number;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  similarityThreshold: number;
  reranking: boolean;
  notifications: {
    processingComplete: boolean;
    weeklyDigest: boolean;
    productUpdates: boolean;
  };
  compactMode: boolean;
  reduceMotion: boolean;
}
