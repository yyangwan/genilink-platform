import { z } from 'zod';

const count = z.number().int().nonnegative();
const anchor = z.object({
  version: z.literal('answer-anchor-v1'), answer_hash: z.string(),
  status: z.enum(['valid', 'unavailable', 'invalid']), reason: z.string().optional(),
  start: count.optional(), end: count.optional(), quote: z.string().optional(),
  offset_unit: z.literal('unicode_code_point').optional(),
}).superRefine((value, ctx) => {
  if (value.status === 'valid' && (value.start === undefined || value.end === undefined ||
    value.end <= value.start || value.offset_unit !== 'unicode_code_point' ||
    Array.from(value.quote || '').length !== value.end - value.start)) ctx.addIssue({ code: 'custom', message: '引用锚点范围无效' });
});
export const sourceObservationSchema = z.object({
  id: z.string().min(1), ordinal: count.nullable(), response_id: z.string().min(1),
  document_id: z.string().nullable(), platform: z.string().min(1), kind: z.string(),
  url: z.string().nullable(), title: z.string().nullable(), url_resolution: z.string().nullable(),
  snapshot_id: z.string().nullable(), fetch_status: z.string().nullable(),
  snapshot_version: z.object({ id: z.string(), body_hash: z.string(), representation_hash: z.string(),
    extractor_version: z.string(), integrity_status: z.string(), article_completeness: z.string() }).nullable(),
  answer_anchor: anchor.nullable(), prompt_hash: z.string().nullable(), observed_at: z.string().nullable(),
  actual_reference: z.boolean(), frozen_version_valid: z.boolean(),
  content_family: z.object({ id: z.string(), method: z.enum(['exact_body', 'near_copy_candidate']), snapshot_ids: z.array(z.string()) }).nullable(),
  content_coverage: z.object({ saved_text_characters: count.nullable(), processed_characters: count.nullable(),
    stored_text_integrity: z.enum(['verified', 'unknown']), article_completeness: z.string() }).nullable(),
  publisher_independence: z.literal('unknown'), platform_preference_inference: z.literal('not_established'),
}).superRefine((value, ctx) => {
  if (value.actual_reference !== (value.kind === 'answer_reference')) ctx.addIssue({ code: 'custom', message: '引用类型不一致' });
  const coverage = value.content_coverage;
  if (coverage?.saved_text_characters != null && coverage.processed_characters != null && coverage.processed_characters > coverage.saved_text_characters) ctx.addIssue({ code: 'custom', message: '文字分析范围超过保存文字' });
});
export const sourcePageSchema = z.object({
  version: z.literal('source-observations-v2').nullable(), status: z.enum(['published', 'pending']),
  items: z.array(sourceObservationSchema), total: count, next_offset: count.nullable(),
  independent_publishers: z.null(),
  can_write: z.boolean().default(false),
  content_family_coverage: z.object({ compared_pairs: count, pair_limit: count,
    status: z.enum(['partial', 'processed']), provenance_independence: z.literal('unknown') }).nullable(),
});
export type SourceObservation = z.infer<typeof sourceObservationSchema>;
export type SourcePage = z.infer<typeof sourcePageSchema>;
export type ArticleGroup = { key: string; entries: SourceObservation[]; total: number };

/** Filter observations before grouping: never borrow another platform's status or body. */
export function groupSources(rows: SourceObservation[], filter: { platform: string; status: string; query: string }) {
  const groups = new Map<string, ArticleGroup>();
  const key = (row: SourceObservation) => row.document_id || 'observation:' + row.id;
  const totals = new Map<string, number>();
  rows.forEach(row => totals.set(key(row), (totals.get(key(row)) || 0) + 1));
  for (const row of rows) {
    if (filter.platform && row.platform !== filter.platform) continue;
    if (filter.status === 'saved' && !readableSnapshot(row)) continue;
    if (filter.status === 'unavailable' && readableSnapshot(row)) continue;
    if (filter.status === 'actual' && !row.actual_reference) continue;
    if (filter.status === 'candidate' && row.actual_reference) continue;
    if (filter.query && ![row.title, row.url].join(' ').toLowerCase().includes(filter.query.trim().toLowerCase())) continue;
    const group = groups.get(key(row));
    if (group) group.entries.push(row);
    else groups.set(key(row), { key: key(row), entries: [row], total: totals.get(key(row))! });
  }
  return [...groups.values()];
}
export function readableSnapshot(row: SourceObservation) {
  return !!row.snapshot_id && row.frozen_version_valid && row.snapshot_version?.id === row.snapshot_id;
}
export function sourceKind(kind: string) {
  return ({ answer_reference: '回答实际引用', search_candidate: '检索候选', text_link: '文本链接' } as Record<string, string>)[kind] || '类型未确认';
}
export function completeness(value?: string) {
  return ({ complete: '全文完整', partial: '原文章不完整', unknown: '原文章完整性未知' } as Record<string, string>)[value || ''] || '原文章完整性未知';
}

/** Publish only an internally consistent full projection; partial pages are never a total. */
export async function loadSourceObservations(projectId: string, runId: string, signal: AbortSignal): Promise<SourcePage> {
  let offset: number | null = 0, first: SourcePage | null = null;
  const rows: SourceObservation[] = [], ids = new Set<string>();
  while (offset !== null) {
    const p = new URLSearchParams({ projectId, runId, op: 'sourceObservations', offset: String(offset), limit: '100' });
    const response = await fetch('/api/integration/intelligence/tasks?' + p, { signal, cache: 'no-store' });
    if (!response.ok) throw Error('来源观察暂不可读，请重试。');
    const parsed = sourcePageSchema.safeParse(await response.json());
    if (!parsed.success) throw Error('来源观察格式或版本不一致，请重新读取。');
    const page = parsed.data;
    if (!first) first = page;
    if ((page.status === 'published' && !page.version) ||
      (page.status === 'pending' && (page.total !== 0 || page.items.length || page.next_offset !== null)) ||
      page.version !== first.version || page.total !== first.total || page.status !== first.status || page.can_write !== first.can_write ||
      JSON.stringify(page.content_family_coverage) !== JSON.stringify(first.content_family_coverage) ||
      page.items.length > 100 || page.items.some(row => ids.has(row.id)) ||
      (page.next_offset !== null && (page.next_offset !== offset + page.items.length || page.next_offset >= page.total || page.next_offset <= offset))) {
      throw Error('来源观察分页发生变化，请重新读取完整结果。');
    }
    for (const row of page.items) { if (ids.has(row.id)) throw Error('来源观察重复，请重新读取。'); ids.add(row.id); rows.push(row); }
    if (rows.length > first.total) throw Error('来源观察数量不一致，请重新读取。');
    offset = page.next_offset;
  }
  if (!first || rows.length !== first.total) throw Error('来源观察尚未完整读取，请重试。');
  return { ...first, items: rows };
}

export interface EvidenceAlignment {
  observations: Array<{ citation_id: string; claim_hash: string; answer_span: { start: number; end: number; quote: string };
    association: { method: string; inferred_association?: boolean }; available_segments: number;
    selected: Array<{ segment_id: string; start: number; end: number; status: string; evidence_id?: string }>;
    unchecked_ranges: number[][]; unavailable_reason: string | null }>;
  checked_pairs: number; unchecked_pairs: number; deferred_pairs: number; invalid_pairs: number;
}
export interface SourceVerification {
  association?: { method: string; inferred_association?: boolean };
  answer_span?: { start: number; end: number; quote: string };
  source_span?: { start: number; end: number; quote: string } | null;
  checked_dimensions?: string[];
  result?: { checks?: Array<{ dimension: string; relation: string; answer_quote: string; source_quote: string }> };
}
