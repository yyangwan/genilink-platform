import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-f0-9]{32}$/);
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const base = {
  baselineRunId: id,
  title: z.string().trim().min(5).max(200),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
};
export const cohortRequestSchema = z.discriminatedUnion('comparisonMode', [
  z.object({ ...base, comparisonMode: z.literal('inferential_v1'), entityIds: z.array(id).min(1).max(20).refine(unique),
    brandTargetIds: z.never().optional(), platforms: z.never().optional(), promptHashes: z.never().optional(),
    actionId: z.never().optional(), expectedActionRevision: z.never().optional(), publicationAssetIds: z.never().optional() }),
  z.object({ ...base, comparisonMode: z.literal('descriptive_v1'), entityIds: z.never().optional(),
    brandTargetIds: z.array(z.string().regex(/^(registry|entity):[a-zA-Z0-9_-]{1,180}$/)).min(1).max(20).refine(unique),
    platforms: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/)).max(20).refine(unique).default([]),
    promptHashes: z.array(hash).max(1000).refine(unique).default([]),
    actionId: id.optional(), expectedActionRevision: z.number().int().positive().optional(),
    publicationAssetIds: z.array(id).max(20).refine(unique).optional(),
  }),
]).refine(row => row.comparisonMode !== 'descriptive_v1' || (
  Boolean(row.actionId) === Boolean(row.expectedActionRevision) && (!row.publicationAssetIds?.length || Boolean(row.actionId))
));

export const publicationRequestSchema = z.object({
  actionId: id, expectedRevision: z.number().int().positive(), deliveryEventId: id,
  artifactIndex: z.number().int().min(0).max(9), versionConfirmed: z.literal(true),
  url: z.string().max(4096).refine(value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } }),
  channel: z.enum(['wechat', 'weibo', 'xiaohongshu', 'douyin', 'website', 'zhihu', 'toutiao']),
  publishedAt: z.string().refine(value => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now()),
  reason: z.string().trim().min(5).max(2000), idempotencyKey: base.idempotencyKey,
});
export const retryRetestSchema = z.object({ cohortId: id, retestId: id, expectedRetryStamp: hash, idempotencyKey: base.idempotencyKey });
