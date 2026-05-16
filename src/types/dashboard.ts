export interface KPIData {
  label: string;
  value?: string | number;
  change?: string;
  changeLabel?: string;
  empty?: boolean;
}

export interface PlatformCoverage {
  name: string;
  score: number;
}

export interface VisibilitySummary {
  overallScore: number | null;
  mentionCount: number;
  platformCoverage: PlatformCoverage[];
  competitorRank: number | null;
  suggestions: Suggestion[];
  latestAuditDate: string | null;
}

export interface GeoSummary {
  websites: {
    id: string;
    name: string;
    domain: string;
    aiScore: number | null;
    citationCount: number;
    lastAnalyzedAt: string | null;
  }[];
  totalCitations: number;
  avgAiScore: number | null;
  optimizationTasks: OptimizationTask[];
}

export interface ContentSummary {
  totalContent: number;
  publishedCount: number;
  recentContent: {
    id: string;
    title: string;
    platform: string;
    createdAt: string;
  }[];
  qualityAvg: number | null;
}

export interface Suggestion {
  text: string;
  priority: string;
}

export interface OptimizationTask {
  text: string;
  priority: string;
  status: string;
}

export interface DashboardSectionState<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
}
