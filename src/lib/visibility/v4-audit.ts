export type SampleState = 'received' | 'pending' | 'failed';

export interface CaptureCounts {
  planned: number;
  received: number;
  failed: number;
  pending: number;
}

export interface AuditCaptureSummary {
  audit_id: string;
  mode?: 'v4';
  status: string;
  published_run_id: string | null;
  can_write: boolean;
  platforms?: Array<CaptureCounts & { platform: string }>;
  capture?: CaptureCounts & { state: string; closed_at: string | null };
  archive?: {
    state: string;
    observed: number;
    linked: number;
    archived: number;
    unavailable: number;
    pending: number;
    deadline_at: string | null;
    settled_at: string | null;
  };
  analysis?: {
    state: string;
    attempt_id: string | null;
    attempt_no: number | null;
    can_retry: boolean;
    failure_reason: string | null;
  };
  poll_after_ms?: number | null;
}

export interface CaptureSample {
  id: string;
  platform: string;
  prompt_excerpt: string;
  status: SampleState;
  source_count: number;
  archived_count: number;
  answer_status: 'complete' | 'partial' | null;
}

export interface CaptureSamplePage {
  items: CaptureSample[];
  next_cursor: string | null;
}

export interface CaptureSource {
  ordinal: number;
  title: string;
  url: string | null;
  snippet: string;
  archive: {
    status: string;
    reason?: string;
    snapshot_id?: string;
    archived_at?: string;
    completeness?: string;
    used_in_analysis?: boolean;
    has_media?: boolean;
  };
}

export interface CaptureSourceMedia {
  ordinal: number;
  kind: 'image' | 'video';
  label: string;
  url: string | null;
  text_offset: number | null;
  has_preview: boolean;
}

export interface CaptureSourceOriginal {
  text: string;
  media?: CaptureSourceMedia[];
}

export interface CaptureSampleDetail {
  id: string;
  platform: string;
  status: SampleState;
  prompt: { id: number; text: string };
  attempts: Array<{ number: number; status: string; reason: string | null; started_at: string | null; ended_at: string | null }>;
  answer: { id: string; text: string; status: 'complete' | 'partial'; observed_at: string; references?: CaptureAnswerReference[] } | null;
  sources: CaptureSource[];
  source_panel: { status: string; expectedCount: number | null; capturedCount: number } | null;
}

export interface CaptureAnswerReference {
  start: number;
  end: number;
  ordinal: number;
}

export interface BrandTarget {
  target_id: string;
  name: string;
  role: string;
  identity_method: string;
  identity_status: string;
}

export interface ScoreCoverage {
  capture_planned: number;
  planned: number;
  scored: number;
  planned_platforms: number;
  scored_platforms: number;
  scored_sample_ids?: string[];
  missing_reasons: Record<string, number>;
  platforms: Array<{
    platform: string;
    value: number | null;
    planned: number;
    scored: number;
    missing_reasons: Record<string, number>;
  }>;
}

export interface VisibilityScore {
  value: number | null;
  no_score_reason: string | null;
  dimensions?: Array<{ dimension: string; weight: number; value: number | null; points: number | null }>;
  coverage?: ScoreCoverage;
}

export interface VisibilityRecommendation {
  id: string;
  title: string;
  dimension: string;
  gap: number;
  platform: string;
  scenario: string | null;
  prompt_id: string;
  prompt: string;
  sample_id: string;
  response_id: string;
  observed_reason: string;
  deliverable: string;
  success_check: string;
  observed_gap_samples: number;
  common_samples_in_scope: number;
  evidence: Array<{ signal_id: string; quote: string }>;
  source_support: Array<{ snapshot_id: string; ordinal: number | null; source_quote: string }>;
  action_opportunity?: { id: string; scenario: string };
  action_id?: string;
}

export interface AuditScoreReport {
  audit_id: string;
  run_id: string | null;
  status: string;
  own_target_id?: string | null;
  rule_version?: string;
  source_coverage?: { observed: number; archived: number };
  targets: BrandTarget[];
  score: VisibilityScore;
  scope_score?: VisibilityScore | null;
  comparison: {
    target_id: string;
    common_sample_count: number;
    scope_planned: number;
    own_only_count: number;
    comparison_only_count: number;
    own: VisibilityScore | null;
    other: VisibilityScore | null;
  } | null;
  recommendations: VisibilityRecommendation[];
}

export function auditApi(view: string, projectId: string, auditId: string, options?: Record<string, string>) {
  return '/api/integration/intelligence?' + new URLSearchParams({ view, projectId, auditId, ...options });
}

export function captureHref(projectId: string, auditId: string, sampleId?: string, source?: { ordinal: number; snapshot_id: string }) {
  const params = new URLSearchParams({ project: projectId, auditId });
  if (sampleId) params.set('sampleId', sampleId);
  if (source) {
    params.set('ordinal', String(source.ordinal));
    params.set('snapshotId', source.snapshot_id);
  }
  return '/visibility?' + params;
}

export const isAuditId = (value: string | null): value is string => !!value && /^[1-9][0-9]{0,17}$/.test(value);
export const isRecordId = (value: string | null): value is string => !!value && /^[a-f0-9]{32}$/.test(value);

export async function readAuditJson<T>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal, cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    const message = response.status === 403 ? '当前项目权限或订阅不支持此操作。'
      : typeof data?.error === 'string' ? data.error : '审计数据暂不可用。';
    throw new Error(message);
  }
  return data as T;
}
