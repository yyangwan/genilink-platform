// Types for 智見 (Visibility) service data

// ── Brands ──
export interface Brand {
  id: number;
  name: string;
  aliases: string[];
  is_competitor: boolean;
  created_at: string;
  updated_at: string;
}

export interface BrandCreateRequest {
  name: string;
  aliases?: string[];
  is_competitor?: boolean;
}

// ── Prompts ──
export interface Prompt {
  id: number;
  text: string;
  platform?: string;
  category?: string;
  created_at: string;
}

export interface PromptCreateRequest {
  text: string;
  platform?: string;
  category?: string;
}

// ── Audits ──
export interface Audit {
  id: number;
  project_id: number;
  status: 'pending' | 'collecting' | 'analyzing' | 'completed' | 'failed';
  phase?: string;
  overall_score: number | null;
  started_at: string;
  completed_at: string | null;
  error_message?: string;
}

export interface AuditListItem {
  id: number;
  status: string;
  overall_score: number | null;
  started_at: string;
  completed_at: string | null;
  platforms?: PlatformScore[];
}

// ── Reports ──
export interface PlatformScore {
  platform: string;
  score: number;
  change?: number;
}

export interface ReportInsight {
  id: string;
  type: 'strength' | 'weakness' | 'opportunity';
  text: string;
  priority: 'high' | 'medium' | 'low';
  platform?: string;
}

export interface ReportData {
  audit_id: number;
  overall_score: number;
  score_label?: string;
  percentile?: number;
  platforms: PlatformScore[];
  insights: ReportInsight[];
  brands: BrandMention[];
  prompts: PromptResult[];
}

export interface BrandMention {
  brand: string;
  mention_count: number;
  visibility_score: number;
  is_own: boolean;
}

export interface PromptResult {
  prompt: string;
  platform: string;
  brand: string;
  mentioned: boolean;
  confidence: number | null;
  recommended: boolean;
  rank: number | null;
}

// ── Content Intelligence ──
export interface ContentIntelligence {
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topics: {
    topic: string;
    count: number;
    sentiment: number;
  }[];
  sources: {
    source: string;
    domain: string;
    mention_count: number;
    authority_score: number;
  }[];
  heatmap?: {
    platform: string;
    category: string;
    score: number;
  }[];
}

// ── Strategic Intelligence ──
export interface StrategicData {
  source_authority: {
    date: string;
    sources: { source: string; authority: number }[];
  }[];
  competitor_positioning: {
    brand: string;
    score: number;
    visibility: number;
    is_own: boolean;
  }[];
  structure_evolution: {
    period: string;
    structured: number;
    semi_structured: number;
    unstructured: number;
  }[];
}

// ── Suggestions ──
export interface SuggestionDetail {
  id: number;
  text: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'resolved' | 'dismissed';
  category?: string;
  platform?: string;
  audit_id?: number;
  created_at: string;
  resolved_at?: string;
}

// ── Schedules ──
export interface Schedule {
  id: number;
  cron_expression: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface ScheduleCreateRequest {
  cron_expression: string;
}

// ── Trends ──
export interface TrendData {
  period: string;
  overall_score: number;
  platforms: {
    platform: string;
    score: number;
  }[];
}

export interface TrendAnnotation {
  id: number;
  date: string;
  text: string;
  created_at: string;
}

// ── Comparison ──
export interface AuditComparison {
  audit_a: {
    id: number;
    overall_score: number;
    started_at: string;
    platforms: PlatformScore[];
    insights: ReportInsight[];
  };
  audit_b: {
    id: number;
    overall_score: number;
    started_at: string;
    platforms: PlatformScore[];
    insights: ReportInsight[];
  };
  delta: {
    overall_score: number;
    platforms: {
      platform: string;
      delta: number;
    }[];
    new_insights: ReportInsight[];
    removed_insights: ReportInsight[];
  };
}

// ── Competitor Profile ──
export interface CompetitorProfile {
  brand: string;
  overall_score: number;
  score_trend: { date: string; score: number }[];
  platform_breakdown: PlatformScore[];
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

// ── Notifications ──
export interface Notification {
  id: string;
  type: 'audit_completed' | 'suggestion_generated' | 'score_change';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  action_url?: string;
}

// ── Platforms ──
export interface Platform {
  id: string;
  name: string;
  icon?: string;
  configured: boolean;
}
