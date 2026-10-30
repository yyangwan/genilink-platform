import { z } from 'zod';
import { apiError } from './task-view';

const reference = z.object({ project_id: z.string(), owner_kind: z.enum(['owned_asset', 'snapshot']), owner_id: z.string(),
  run_id: z.string().nullable(), segment_id: z.string().nullable(), text_hash: z.string(), quote: z.string(), start: z.number().int(), end: z.number().int() });
export const factSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('owned_asset_revision'), asset_id: z.string(), asset_revision: z.number().int().positive(), verification_id: z.string(), evidence: reference }),
  z.object({ kind: z.literal('citation_review'), review_id: z.string(), evidence_id: z.string(), citation_id: z.string(), snapshot_id: z.string(), evidence: reference }),
]);
const fact = z.object({ id: z.string(), status: z.string(), eligible: z.boolean(), selected: z.boolean(), eligibility_reason: z.string(),
  semantic_fit: z.literal('requires_named_review'), statement: z.string().optional(), scope: z.string().optional(), version: z.number().int().positive().optional(),
  source_ref: factSource.optional().catch(undefined), valid_from: z.string().optional(), valid_until: z.string().optional(),
  qualification: z.object({ policy: z.literal('fact-qualification-v1'), source_valid: z.boolean(), semantic_fit: z.literal('not_verified') }),
});
const pageSchema = z.object({ version: z.literal('fact-qualification-v1'), action_id: z.string(), revision: z.number().int().positive(), revision_id: z.string(),
  projection_hash: z.string().regex(/^[a-f0-9]{64}$/), total: z.number().int().nonnegative(), next_offset: z.number().int().nonnegative().nullable(),
  can_write: z.boolean(), items: z.array(fact).max(100), selection_is_not_content_authorization: z.literal(true), semantic_fit: z.literal('requires_named_review') });
export type EligibleFact = z.infer<typeof fact>;
export type FactCollection = z.infer<typeof pageSchema>;

export async function loadEligibleFacts(projectId: string, actionId: string, revision: number, revisionId: string, signal?: AbortSignal): Promise<FactCollection> {
  let offset: number | null = 0, first: FactCollection | null = null;
  const items: EligibleFact[] = [], ids = new Set<string>();
  while (offset !== null) {
    const query = new URLSearchParams({ projectId, actionId, expectedRevision: String(revision), op: 'eligibleFacts', offset: String(offset), limit: '100' });
    const response = await fetch('/api/integration/intelligence/tasks?' + query, { signal, cache: 'no-store' });
    const raw = await response.json();
    if (!response.ok) throw Error(apiError(raw, '事实资格读取失败，请刷新任务后重试。'));
    const result = pageSchema.safeParse(raw);
    if (!result.success) throw Error('事实清单格式异常，请重新读取。');
    const page = result.data;
    if (page.action_id !== actionId || page.revision !== revision || page.revision_id !== revisionId || page.items.some(row => row.eligible && (!row.statement || !row.scope || !row.source_ref || !row.valid_from || !row.valid_until || !row.qualification.source_valid || row.status !== 'valid' || row.source_ref.evidence.project_id !== projectId))) throw Error('事实与任务范围不一致，请刷新后重试。');
    if (!first) first = page;
    if (page.projection_hash !== first.projection_hash || page.total !== first.total || page.can_write !== first.can_write) throw Error('事实资格已变化，请重新读取完整清单。');
    for (const row of page.items) { if (ids.has(row.id)) throw Error('事实清单重复，请重新读取。'); ids.add(row.id); items.push(row); }
    if (items.length > first.total || page.next_offset !== null && (page.next_offset !== items.length || page.next_offset <= offset || page.next_offset >= first.total)) throw Error('事实分页不完整，请重新读取。');
    offset = page.next_offset;
  }
  if (!first || items.length !== first.total) throw Error('事实清单未完整读取，请重试。');
  return { ...first, items };
}
