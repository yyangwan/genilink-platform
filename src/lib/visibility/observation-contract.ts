import { z } from 'zod';
import { taskPackSchema } from './task-contract';
import { apiError } from './task-view';

const id = z.string().regex(/^[a-f0-9]{32}$/), hash = z.string().regex(/^[a-f0-9]{64}$/);
export const targetSchema = z.object({ target_id: z.string(), name: z.string(), role: z.string(), identity_status: z.string() });
export const assetSchema = z.object({ id, action_id: id, url: z.string(), channel: z.string(), published_at: z.string(), reason: z.string(),
  verification: z.literal('human_attested_delivery_version'), published_bytes_verified: z.literal(false),
  provenance: z.object({ revision: z.number().int().positive(), revision_id: id, action_title: z.string(), artifact: z.object({ title: z.string() }) }),
});
const linkSchema = z.object({ policy_version: z.literal('publication-window-v1'), action_id: id, revision: z.number().int().positive(),
  revision_id: id, action_title: z.string(), publications: z.array(assetSchema) });
export const cohortSchema = z.object({ id, title: z.string(), baseline_run_id: id, comparison_mode: z.string(), created_at: z.string(),
  expected_samples: z.number().int().nonnegative(), platforms: z.array(z.string()), brand_targets: z.array(targetSchema),
  action_link: linkSchema.nullable(), questions: z.array(z.object({ platform: z.string(), prompt_hash: hash, text: z.string().nullable() })),
});
export const actionSchema = z.object({ id, title: z.string(), revision: z.number().int().positive(), revision_id: id,
  run_id: id, integrity_valid: z.boolean(), task_pack_available: z.boolean() });
export const optionsSchema = z.object({ action_id: id, revision: z.number().int().positive(), revision_id: id, action_title: z.string(),
  is_current: z.boolean(), can_register: z.boolean(), can_write: z.boolean(), task_pack: taskPackSchema.nullable(),
  execution_status: z.string().optional(), deliveries: z.array(z.object({ delivery_event_id: id, artifact_index: z.number().int(), title: z.string(),
    kind: z.string(), submitted_at: z.string(), verification: z.string(), version_fingerprint: hash, acceptance_state: z.string() })),
});
export const retestSchema = z.object({ id, cohort_id: id, audit_id: z.string(), capture_status: z.string(), sample_scope_valid: z.boolean(),
  expected_samples: z.number().int().nonnegative(), complete_samples: z.number().int().nonnegative(), pending_samples: z.number().int().nonnegative(),
  missing_samples: z.number().int().nonnegative(), published_run_id: id.nullable(), analysis_pending: z.boolean(),
  retry_stamp: hash, can_retry: z.boolean(), retry_limit_reached: z.boolean(),
  platforms: z.array(z.object({ platform: z.string(), expected: z.number(), complete: z.number(), pending: z.number(), missing: z.number() })),
});
const factSchema = z.object({ known: z.boolean(), value: z.number().nullable(), reason_codes: z.array(z.string()),
  evidence_ids: z.array(z.string()), source_traces: z.array(z.object({}).passthrough()) });
const metricSchema = z.object({ metric: z.string(), unit: z.string(), baseline: factSchema, followup: factSchema,
  comparison_state: z.string(), reason_codes: z.array(z.string()), observed_delta: z.number().nullable() });
const observationSchema = z.object({ prompt_hash: hash, baseline_sample_id: z.string(), baseline_response_id: z.string().nullable(), followup_response_id: z.string().nullable(),
  baseline_observed_at: z.string().nullable(), followup_observed_at: z.string().nullable(), comparison_state: z.string(), reason_codes: z.array(z.string()),
  publication_window: z.object({ status: z.string() }).optional(),
  targets: z.array(z.object({ brand_target_id: z.string(), metrics: z.array(metricSchema) })),
});
export const observationResultSchema = z.object({ id, cohort_id: id, comparison_mode: z.literal('descriptive_v1'), version: z.literal('brand-observation-descriptive-1'),
  baseline_run_id: id, followup_run_id: id, created_at: z.string(), snapshot_current: z.boolean(), brand_targets: z.array(targetSchema),
  action_link: linkSchema.optional(), platforms: z.array(z.object({ platform: z.string(), observations: z.array(observationSchema) })),
});
export type ObservationCohort = z.infer<typeof cohortSchema>;
export type Publication = z.infer<typeof assetSchema>;
export type PublicationOptions = z.infer<typeof optionsSchema>;
export type Retest = z.infer<typeof retestSchema>;
export type ObservationResult = z.infer<typeof observationResultSchema>;
export type ObservationAction = z.infer<typeof actionSchema>;
export const chinaTime = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '时间待确认';
// datetime-local is a wall clock; the form explicitly labels it Beijing time.
export const beijingTimestamp = (value: string) => value ? new Date(value + ':00+08:00').toISOString() : '';
export class ObservationError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function observationGet(projectId: string, view: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, view, ...params })}`, { signal, cache: 'no-store' });
  const data: unknown = await response.json(); if (!response.ok) throw new ObservationError(apiError(data, '记录暂不可读，请刷新后重试。'), response.status); return data;
}
export async function observationPost(body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data: unknown = await response.json(); if (!response.ok) throw new ObservationError(apiError(data, '操作未确认，请核对范围和版本。'), response.status); return data;
}
export async function observationPages<T>(project: string, view: string, key: string, schema: z.ZodType<T>, params: Record<string, string> = {}, signal?: AbortSignal) {
  const rows: T[] = [], cursors = new Set<string>(); let before = '', canWrite = false;
  do {
    const page = z.object({ [key]: z.array(schema), next_before: id.nullable(), can_write: z.boolean() }).parse(await observationGet(project, view, { ...params, ...(before ? { before } : {}) }, signal));
    rows.push(...page[key] as T[]); canWrite = page.can_write as boolean;
    before = page.next_before as string || ''; if (before && cursors.has(before)) throw Error('分页记录已变化，请重新读取。'); cursors.add(before);
  } while (before);
  return { rows, canWrite };
}
