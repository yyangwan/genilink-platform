import type { SourceObservation, SourcePage } from '@/lib/visibility/source-observation';
import type { EvidenceRun } from '@/types/intelligence';

export const sourceRunId = 'a'.repeat(32), projectId = 'source-project';
export const sourceText = '正文开头😀适合多区域部署，需要核对范围。';
export function observation(changes: Partial<SourceObservation> = {}): SourceObservation {
  return { id: 'b'.repeat(32), ordinal: 0, response_id: 'c'.repeat(32), document_id: 'd'.repeat(32),
    platform: 'deepseek', kind: 'answer_reference', actual_reference: true, title: '连锁门店权限与实施案例',
    url: 'https://example.com/case', url_resolution: 'exact', snapshot_id: 'e'.repeat(32), fetch_status: 'captured',
    snapshot_version: { id: 'e'.repeat(32), body_hash: 'f'.repeat(64), representation_hash: '1'.repeat(64), extractor_version: 'test-v1', integrity_status: 'verified', article_completeness: 'unknown' },
    answer_anchor: { version: 'answer-anchor-v1', answer_hash: '2'.repeat(64), status: 'valid', start: 2, end: 6, quote: '适合😀门', offset_unit: 'unicode_code_point' },
    prompt_hash: '3'.repeat(64), observed_at: '2026-10-25T08:00:00Z', frozen_version_valid: true,
    content_family: { id: '4'.repeat(64), method: 'near_copy_candidate', snapshot_ids: ['e'.repeat(32), '5'.repeat(32)] },
    content_coverage: { saved_text_characters: 5000, processed_characters: 2400, stored_text_integrity: 'verified', article_completeness: 'unknown' },
    publisher_independence: 'unknown', platform_preference_inference: 'not_established', ...changes };
}
export function sourcePage(items: SourceObservation[] = [observation()], changes: Partial<SourcePage> = {}): SourcePage {
  return { version: 'source-observations-v2', status: 'published', items, total: items.length, next_offset: null,
    independent_publishers: null, can_write: true, content_family_coverage: { compared_pairs: 20, pair_limit: 20000, status: 'partial', provenance_independence: 'unknown' }, ...changes };
}
export function sourceRun(): EvidenceRun {
  const quote = '😀适合多区域部署', start = Array.from('正文开头').length;
  return { id: sourceRunId, audit_id: '99', revision: 3, status: 'partial', created_at: '2026-10-25T08:00:00Z',
    sources: [], responses: [{ id: 'c'.repeat(32), platform: 'deepseek', prompt: '连锁门店如何选择监测方案？', prompt_hash: '3'.repeat(64), observed_at: '2026-10-25T08:00:00Z', error: false },
      { id: '6'.repeat(32), platform: 'qwen', prompt: '千问的独立问题', prompt_hash: '7'.repeat(64), observed_at: '2026-10-25T08:01:00Z', error: false }],
    coverage: { evidence_alignment: { checked_pairs: 1, unchecked_pairs: 2, deferred_pairs: 1, invalid_pairs: 1, observations: [{ citation_id: 'b'.repeat(32), claim_hash: '8'.repeat(64),
      answer_span: { start: 0, end: 4, quote: '回答观点' }, association: { method: 'answer_anchor' }, available_segments: 3,
      selected: [{ segment_id: '9'.repeat(32), start: 0, end: 1000, status: 'checked', evidence_id: '0'.repeat(32) }, { segment_id: '1'.repeat(32), start: 1000, end: 2000, status: 'deferred' }], unchecked_ranges: [[1000, 5000]], unavailable_reason: null }] } },
    summary: { claim_evidence: [{ id: '0'.repeat(32), citation_id: 'b'.repeat(32), response_id: 'c'.repeat(32), snapshot_id: 'e'.repeat(32), platform: 'deepseek', answer_quote: '品牌能否多区域部署', source_quote: quote,
      source_title: '连锁门店权限与实施案例', source_url: 'https://example.com/case', relation: 'partial', review_state: 'unreviewed', method: 'model_verification', source_segment_id: '9'.repeat(32), conflicting_interpretations: true,
      verification: { association: { method: 'answer_anchor' }, source_span: { start, end: start + Array.from(quote).length, quote }, result: { checks: [{ dimension: 'scope', relation: 'partial', answer_quote: '多区域', source_quote: '多区域部署' }] } } }] } };
}
