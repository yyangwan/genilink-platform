import type { BrandTarget, VisibilityScore } from './v4-audit';

export type ComparisonTarget = BrandTarget & { entity_id: string | null; registry_brand_id: string | null };
export type ComparisonQuestion = {
  id: string;
  prompt: string;
  prompt_hash: string;
  scenario: string | null;
  scope: string | null;
  platforms: string[];
};
export type CitationProof = {
  id: string;
  answer_quote: string;
  quote: string;
  relation: string;
  reviewed: boolean;
  start: number;
  end: number;
};
export type ComparisonSource = {
  id: string;
  title: string | null;
  url: string | null;
  domain: string | null;
  content_type: string;
  family_id: string | null;
  snapshot_id: string | null;
  fetch_status: string | null;
  snippet: string | null;
  ordinal: number | null;
  frozen: boolean;
  anchor: boolean;
  evidence: CitationProof[];
};
export type RecommendationFinding = {
  entity_id: string;
  target_id: string | null;
  name: string;
  identity_status: string;
  recommendation: string;
  rank: number | null;
  quote: string;
  reasons: Array<{ id: string; quote: string; categories: string[]; evidence: Array<CitationProof & { source_id: string }> }>;
};
export type ComparisonSample = {
  sample_id: string | null;
  platform: string;
  response_id: string | null;
  status: string;
  analysis_ready?: boolean;
  absent_targets?: string[];
  search_mode: string | null;
  findings: RecommendationFinding[];
  sources: ComparisonSource[];
};
type MatrixRow = { key: string | null; planned: number; common: number; own: number | null; other: number | null };
export interface ComparisonReport {
  run_id: string;
  audit_id: string;
  revision: number;
  targets: ComparisonTarget[];
  questions: ComparisonQuestion[];
  brands?: {
    rule_version: string;
    own_target_id: string | null;
    comparison_target_id: string | null;
    observations_available: boolean;
    own: VisibilityScore | null;
    pair: { count: number; own: VisibilityScore | null; other: VisibilityScore | null };
    coverage: { received: number; planned: number };
    matrices: { platform: MatrixRow[]; scenario: MatrixRow[] };
    gaps: Array<{ question_id: string; platform: string; gap: number; own_response_id: string | null }>;
    brands: Array<ComparisonTarget & { answer_count: number; recommended_count: number; platforms: string[]; score: VisibilityScore | null }>;
  };
  detail?: { question: ComparisonQuestion; samples: ComparisonSample[] } | null;
}
