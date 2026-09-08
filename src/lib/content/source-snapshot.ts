/**
 * 规范来源快照（设计 §8.4）：只允许白名单字段进入 ContentOS 与 LLM 提示词。
 * 未知字段、令牌、Cookie、原始请求头与用户隐私信息不得进入快照。
 */

import { stableStringify, sha256 } from '@/lib/billing/idempotency';
import {
  SNAPSHOT_LIMITS,
  type ProjectSnapshotV1,
  type VisibilitySuggestionSnapshotV1,
} from '@/contracts/content-creation-brief-v1';
import type { MappedSuggestion } from './canonical-suggestion';

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /\.local$/i,
];

/** 设计 §14.8：参考 URL 只允许 HTTP/HTTPS，拒绝内网地址与携带用户凭证的 URL。 */
export function isAllowedReferenceUrl(raw: string): boolean {
  if (!raw || raw.length > SNAPSHOT_LIMITS.sourceUrlMaxLength) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return !PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

export function filterReferenceUrls(values: string[], limit = SNAPSHOT_LIMITS.sourceArrayMax): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = (raw ?? '').trim();
    if (!value || !isAllowedReferenceUrl(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function cleanText(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function optionalText(value?: string | null): string | undefined {
  const cleaned = cleanText(value);
  return cleaned || undefined;
}

function dedupeStrings(values: string[], limit: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = cleanText(raw);
    if (!value || value.length > maxLength) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

/** 从规范建议构造白名单快照；超长数组与非法 URL 在此收敛。 */
export function buildSourceSnapshot(s: MappedSuggestion): VisibilitySuggestionSnapshotV1 {
  return {
    schemaVersion: 1,
    suggestionId: String(s.id),
    text: cleanText(s.text),
    description: optionalText(s.description),
    category: optionalText(s.category),
    priority: optionalText(s.priority),
    actionType: optionalText(s.action_type),
    typeTags: dedupeStrings(s.type_tags ?? [], SNAPSHOT_LIMITS.tagArrayMax, SNAPSHOT_LIMITS.tagMaxLength),
    keywords: dedupeStrings(s.keywords ?? [], SNAPSHOT_LIMITS.tagArrayMax, SNAPSHOT_LIMITS.tagMaxLength),
    contentOutline: optionalText(s.content_outline),
    evidenceSummary: optionalText(s.evidence_summary),
    auditFindings: dedupeStrings(s.audit_findings ?? [], SNAPSHOT_LIMITS.sourceArrayMax, SNAPSHOT_LIMITS.auditFindingMaxLength),
    acceptanceCriteria: dedupeStrings(s.acceptance_criteria ?? [], SNAPSHOT_LIMITS.sourceArrayMax, SNAPSHOT_LIMITS.acceptanceCriterionMaxLength),
    expectedResult: optionalText(s.expected_result),
    successMetric: optionalText(s.success_metric),
    measurementPlan: optionalText(s.measurement_plan),
    evidenceSources: filterReferenceUrls(s.evidence_sources ?? []),
    actionSources: filterReferenceUrls(s.action_sources ?? []),
    requestedChannels: dedupeStrings(
      [...(s.action_channels ?? []), ...(s.evidence_channels ?? []), s.platform ?? ''],
      SNAPSHOT_LIMITS.sourceArrayMax,
      64,
    ),
  };
}

export interface ProjectSnapshotRow {
  id: string;
  name: string;
  url?: string | null;
  industry?: string | null;
  productName?: string | null;
  productKeywords: string[];
  productDescription?: string | null;
}

export function buildProjectSnapshot(p: ProjectSnapshotRow): ProjectSnapshotV1 {
  const snapshot: ProjectSnapshotV1 = {
    schemaVersion: 1,
    projectId: p.id,
    name: cleanText(p.name) || '未命名项目',
    url: isAllowedReferenceUrl(cleanText(p.url)) ? cleanText(p.url) : undefined,
    industry: optionalText(p.industry),
    productName: optionalText(p.productName),
    productKeywords: dedupeStrings(p.productKeywords ?? [], SNAPSHOT_LIMITS.tagArrayMax, 80),
    productDescription: optionalText(p.productDescription),
  };
  return snapshot;
}

/** 规范哈希：与 ContentOS 使用相同的 stableStringify+sha256，序列化规范化后双方一致。 */
export function computeSourceHash(snapshot: VisibilitySuggestionSnapshotV1): string {
  return sha256(stableStringify(snapshot));
}

/**
 * 校验快照是否在 §8.3 限制内。
 * 超限不得静默截断后继续；返回超限字段名供 422 SOURCE_PAYLOAD_TOO_LARGE 使用。
 */
export function assertSnapshotLimits(snapshot: VisibilitySuggestionSnapshotV1): string[] {
  const violations: string[] = [];
  const byteLength = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
  if (byteLength > SNAPSHOT_LIMITS.maxPayloadBytes) {
    violations.push('$payload');
  }
  if (snapshot.text.length > SNAPSHOT_LIMITS.textMaxLength) violations.push('text');
  if (snapshot.description && snapshot.description.length > SNAPSHOT_LIMITS.descriptionMaxLength) violations.push('description');
  if (snapshot.evidenceSummary && snapshot.evidenceSummary.length > SNAPSHOT_LIMITS.evidenceSummaryMaxLength) violations.push('evidenceSummary');
  if (snapshot.expectedResult && snapshot.expectedResult.length > SNAPSHOT_LIMITS.expectedResultMaxLength) violations.push('expectedResult');
  if (snapshot.contentOutline && snapshot.contentOutline.length > SNAPSHOT_LIMITS.contentOutlineMaxLength) violations.push('contentOutline');
  if (snapshot.measurementPlan && snapshot.measurementPlan.length > SNAPSHOT_LIMITS.measurementPlanMaxLength) violations.push('measurementPlan');
  if (snapshot.successMetric && snapshot.successMetric.length > SNAPSHOT_LIMITS.successMetricMaxLength) violations.push('successMetric');
  if (snapshot.auditFindings.some((f) => f.length > SNAPSHOT_LIMITS.auditFindingMaxLength)) violations.push('auditFindings');
  if (snapshot.acceptanceCriteria.some((c) => c.length > SNAPSHOT_LIMITS.acceptanceCriterionMaxLength)) violations.push('acceptanceCriteria');
  return violations;
}
