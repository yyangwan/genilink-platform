/**
 * ContentWorkflowV1 — 内容创建工作流契约（TS 视图）。
 *
 * 与 contracts/content-workflow-v1.schema.json 一一对应。
 * 修改本文件必须同步修改 schema 与两仓库的 contracts/ 目录（内容逐字节一致）。
 */

import type { SupportedGenerationPlatform } from "./content-creation-brief-v1";

export const WORKFLOW_SCHEMA_VERSION = 1 as const;

export const WORKFLOW_MAX_PLATFORMS = 4 as const;

export type WorkflowStatus =
  | "queued"
  | "generating"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled";

export type PlatformRunStatus =
  | "queued"
  | "generating"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal"
  | "cancelled";

/** Portal 预占额度生成的操作 ID：content-workflow:<workspaceId>:<sha256(idempotencyKey)> */
export const USAGE_OPERATION_PREFIX = "content-workflow" as const;

export function buildUsageOperationId(
  workspaceId: string,
  idempotencyKeyHash: string,
): string {
  return `content-workflow:${workspaceId}:${idempotencyKeyHash}`;
}

/** Portal → ContentOS 创建工作流请求（Portal 已预占额度，携带 usageOperationId 对账）。 */
export interface CreateContentWorkflowRequestV1 {
  briefId: string;
  briefRevision: number;
  platforms: SupportedGenerationPlatform[];
  templateId?: string;
  brandVoiceId?: string;
  usageOperationId: string;
}

export interface PlatformRunViewV1 {
  platform: string;
  status: PlatformRunStatus;
  error?: {
    code: string;
    message: string;
  };
  attemptCount?: number;
}

export interface WorkflowViewV1 {
  id: string;
  briefId: string;
  briefRevision: number;
  contentPieceId: string | null;
  status: WorkflowStatus;
  platforms: PlatformRunViewV1[];
}
