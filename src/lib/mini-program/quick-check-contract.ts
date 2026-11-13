import { z } from 'zod';

const checkKey = z.enum(['access', 'content', 'title', 'structured_data']);
const evidence = z.string().min(1).max(500);
const check = z.object({
  key: checkKey,
  status: z.enum(['pass', 'issue', 'unknown']),
  evidence: evidence.optional(),
  action: evidence.optional(),
});

export const QUICK_CHECK_RULE_VERSION = 'website-quick-check-v1';

export const quickCheckResult = z.object({
  ruleVersion: z.literal(QUICK_CHECK_RULE_VERSION),
  checkedAt: z.iso.datetime({ offset: true }),
  finalHost: z.string().min(1).max(255).optional(),
  checks: z.array(check).length(4).refine((checks) => new Set(checks.map(({ key }) => key)).size === 4),
  priorityFinding: z.object({
    key: checkKey,
    title: evidence,
    evidence: evidence.optional(),
    action: evidence,
  }).optional(),
});

export type QuickCheckResult = z.infer<typeof quickCheckResult>;
