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
    brandTargetIds: z.never().optional(), platforms: z.never().optional(), promptHashes: z.never().optional() }),
  z.object({ ...base, comparisonMode: z.literal('descriptive_v1'), entityIds: z.never().optional(),
    brandTargetIds: z.array(z.string().regex(/^(registry|entity):[a-zA-Z0-9_-]{1,180}$/)).min(1).max(20).refine(unique),
    platforms: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/)).max(20).refine(unique).default([]),
    promptHashes: z.array(hash).max(1000).refine(unique).default([]),
  }),
]);
