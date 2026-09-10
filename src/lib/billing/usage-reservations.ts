/**
 * 额度预占账本（设计 §5.6/§12.3/§12.5）：
 *
 * - reserve：Serializable 事务内查重 → 统计（排除 released）→ 校验上限 → 插入 reserved；
 * - commit：仅 reserved/pending_reconcile → committed（终态，不可释放）；
 * - release：reserved/pending_reconcile → released；
 * - 状态以 Portal PostgreSQL 为准，与 ContentOS 通过同一 operationId 对账。
 */

import type { InputJsonValue } from '@prisma/client/runtime/client';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { getWorkspaceBillingAccess } from '@/lib/billing/access';
import {
  PlanLimitError,
  FEATURE_LIMIT_KEYS,
  getUsagePeriodStart,
  type UsageFeature,
} from '@/lib/billing/usage';
import { isUniqueConstraintError } from '@/lib/billing/idempotency';

export const USAGE_STATUS = {
  reserved: 'reserved',
  committed: 'committed',
  pendingReconcile: 'pending_reconcile',
  released: 'released',
} as const;

/** 预占过期时间：超过 30 分钟未定案的 reserved 记录触发告警（设计 §15.3）。 */
export const RESERVATION_TTL_MS = 30 * 60_000;
/** 对账阈值：创建结果不确定超过 2 分钟的记录进入对账（设计 §12.5）。 */
export const RECONCILE_AFTER_MS = 2 * 60_000;
/** Serializable 冲突最大重试次数。 */
const SERIALIZATION_RETRIES = 3;

export type ReservationResult =
  | { type: 'reserved'; usageEventId: string }
  | { type: 'replay'; usageEventId: string; status: string }
  | { type: 'conflict' }
  | { type: 'limit'; error: PlanLimitError }
  | { type: 'disabled' };

interface UsageTx {
  usageEvent: {
    findFirst: (args: Prisma.UsageEventFindFirstArgs) => Promise<{ id: string; status: string; requestHash: string | null } | null>;
    aggregate: (args: Prisma.UsageEventAggregateArgs) => Promise<{ _sum: { quantity: number | null } }>;
    create: (args: Prisma.UsageEventCreateArgs) => Promise<{ id: string }>;
  };
}

async function reserveInTransaction(params: {
  tx: UsageTx;
  userId: string;
  workspaceId: string;
  feature: UsageFeature;
  operationId: string;
  requestHash: string;
  quantity: number;
  metadata?: InputJsonValue;
}): Promise<ReservationResult> {
  const { tx, userId, workspaceId, feature, operationId, requestHash, quantity } = params;

  // 1. 按 operationId 查找已有记录（幂等）。
  const existing = await tx.usageEvent.findFirst({
    where: { workspaceId, feature, operationId },
    select: { id: true, status: true, requestHash: true },
  });
  if (existing) {
    if (existing.requestHash === requestHash) {
      return { type: 'replay', usageEventId: existing.id, status: existing.status };
    }
    return { type: 'conflict' };
  }

  // 2. 统计本周期 reserved + pending_reconcile + committed。
  const access = await getWorkspaceBillingAccess(userId, workspaceId);
  const limit = access.limits[FEATURE_LIMIT_KEYS[feature]];
  const aggregate = await tx.usageEvent.aggregate({
    where: {
      workspaceId,
      feature,
      periodStart: getUsagePeriodStart(),
      status: { not: USAGE_STATUS.released },
    },
    _sum: { quantity: true },
  });
  const used = aggregate._sum.quantity ?? 0;
  if (used + quantity > limit) {
    return { type: 'limit', error: new PlanLimitError(feature, used, limit) };
  }

  // 3. 插入 reserved 记录。
  const created = await tx.usageEvent.create({
    data: {
      workspaceId,
      userId,
      feature,
      quantity,
      periodStart: getUsagePeriodStart(),
      metadata: params.metadata ?? undefined,
      operationId,
      requestHash,
      status: USAGE_STATUS.reserved,
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
    },
    select: { id: true },
  });
  return { type: 'reserved', usageEventId: created.id };
}

/**
 * 预占一次内容生成额度（设计 §10.5 步骤 3）。
 * 日志只记录 operationId，不记录原始幂等键。
 */
export async function reserveContentGeneration(params: {
  userId: string;
  workspaceId: string;
  operationId: string;
  requestHash: string;
  quantity?: number;
  metadata?: InputJsonValue;
  feature?: UsageFeature;
}): Promise<ReservationResult> {
  if (process.env.BILLING_DISABLED === 'true') {
    return { type: 'disabled' };
  }

  const feature = params.feature ?? 'content_generation';
  for (let attempt = 0; attempt <= SERIALIZATION_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        (tx) =>
          reserveInTransaction({
            tx: tx as unknown as UsageTx,
            userId: params.userId,
            workspaceId: params.workspaceId,
            feature,
            operationId: params.operationId,
            requestHash: params.requestHash,
            quantity: params.quantity ?? 1,
            metadata: params.metadata,
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        // 并发插入撞到部分唯一索引：回读判定 replay/conflict。
        const existing = await prisma.usageEvent.findFirst({
          where: { workspaceId: params.workspaceId, feature, operationId: params.operationId },
          select: { id: true, status: true, requestHash: true },
        });
        if (existing && existing.requestHash === params.requestHash) {
          return { type: 'replay', usageEventId: existing.id, status: existing.status };
        }
        return { type: 'conflict' };
      }
      if ((err as { code?: string }).code === 'P2034') {
        // Serializable 冲突：重试。
        continue;
      }
      throw err;
    }
  }
  throw new Error('usage reservation failed after serialization retries');
}

export interface OperationStatusResult {
  ok: boolean;
  status: string | null;
  /** committed 是终态，禁止释放。 */
  reason?: 'not-found' | 'already-committed' | 'ok';
}

/** 提交预占（ContentOS 第一次调用内容模型前回调，设计 §10.8）。幂等。 */
export async function commitUsageOperation(operationId: string): Promise<OperationStatusResult> {
  if (process.env.BILLING_DISABLED === 'true') {
    return { ok: true, status: USAGE_STATUS.committed, reason: 'ok' };
  }
  const update = await prisma.usageEvent.updateMany({
    where: {
      operationId,
      status: { in: [USAGE_STATUS.reserved, USAGE_STATUS.pendingReconcile] },
    },
    data: { status: USAGE_STATUS.committed, expiresAt: null },
  });
  if (update.count > 0) {
    return { ok: true, status: USAGE_STATUS.committed, reason: 'ok' };
  }
  const existing = await prisma.usageEvent.findFirst({
    where: { operationId },
    select: { status: true },
  });
  if (existing?.status === USAGE_STATUS.committed) {
    return { ok: true, status: USAGE_STATUS.committed, reason: 'ok' };
  }
  return { ok: false, status: existing?.status ?? null, reason: 'not-found' };
}

/** 释放预占（取消或永久校验失败；已提交的额度不能释放）。 */
export async function releaseUsageOperation(
  operationId: string,
  reason?: string,
): Promise<OperationStatusResult> {
  if (process.env.BILLING_DISABLED === 'true') {
    return { ok: true, status: USAGE_STATUS.released, reason: 'ok' };
  }
  const update = await prisma.usageEvent.updateMany({
    where: {
      operationId,
      status: { in: [USAGE_STATUS.reserved, USAGE_STATUS.pendingReconcile] },
    },
    data: {
      status: USAGE_STATUS.released,
      expiresAt: null,
      ...(reason ? { metadata: { releaseReason: reason } as InputJsonValue } : {}),
    },
  });
  if (update.count > 0) {
    return { ok: true, status: USAGE_STATUS.released, reason: 'ok' };
  }
  const existing = await prisma.usageEvent.findFirst({
    where: { operationId },
    select: { status: true },
  });
  if (existing?.status === USAGE_STATUS.committed) {
    return { ok: false, status: USAGE_STATUS.committed, reason: 'already-committed' };
  }
  return { ok: false, status: existing?.status ?? null, reason: 'not-found' };
}

/** 创建工作流结果不确定时标记对账（设计 §7.3：不得立即释放）。 */
export async function markPendingReconcile(operationId: string): Promise<void> {
  if (process.env.BILLING_DISABLED === 'true') return;
  await prisma.usageEvent.updateMany({
    where: { operationId, status: USAGE_STATUS.reserved },
    data: { status: USAGE_STATUS.pendingReconcile },
  });
}

export interface ReconcileDecision {
  operationId: string;
  action: 'released' | 'committed' | 'kept' | 'warn-timeout';
}

/**
 * 对账待定记录（设计 §12.5，由 /api/internal/content-usage/reconcile 每分钟调用）：
 * 查询 ContentOS by-operation —— 明确不存在 → 释放；已提交 → 提交；
 * 不可用 → 保留（绝不猜测释放）；reserved 超 30 分钟 → 告警。
 */
export async function reconcilePendingUsage(params: {
  now?: Date;
  lookup: (operationId: string) => Promise<
    | { found: false }
    | { found: true; usageStatus: string; workflowStatus: string }
    | { found: false; unavailable: true }
  >;
}): Promise<ReconcileDecision[]> {
  if (process.env.BILLING_DISABLED === 'true') return [];
  const now = params.now ?? new Date();
  const decisions: ReconcileDecision[] = [];

  const pending = await prisma.usageEvent.findMany({
    where: {
      status: { in: [USAGE_STATUS.reserved, USAGE_STATUS.pendingReconcile] },
      operationId: { not: null },
      createdAt: { lt: new Date(now.getTime() - RECONCILE_AFTER_MS) },
    },
    select: { operationId: true, status: true, createdAt: true, expiresAt: true },
    take: 50,
  });

  for (const event of pending) {
    const operationId = event.operationId;
    if (!operationId) continue;
    const lookup = await params.lookup(operationId);

    if ('unavailable' in lookup && lookup.unavailable) {
      decisions.push({ operationId, action: 'kept' });
      continue;
    }
    if (!lookup.found) {
      const result = await releaseUsageOperation(operationId, 'reconcile:not-found');
      decisions.push({ operationId, action: result.ok ? 'released' : 'kept' });
      continue;
    }
    if (lookup.usageStatus === 'committed') {
      const result = await commitUsageOperation(operationId);
      decisions.push({ operationId, action: result.ok ? 'committed' : 'kept' });
      continue;
    }
    if (lookup.usageStatus === 'released') {
      const result = await releaseUsageOperation(operationId, 'reconcile:workflow-released');
      decisions.push({ operationId, action: result.ok ? 'released' : 'kept' });
      continue;
    }
    decisions.push({ operationId, action: 'kept' });
  }

  // reserved 超时告警（设计 §15.3）。
  const stale = await prisma.usageEvent.findMany({
    where: {
      status: USAGE_STATUS.reserved,
      createdAt: { lt: new Date(now.getTime() - RESERVATION_TTL_MS) },
    },
    select: { operationId: true },
    take: 20,
  });
  for (const event of stale) {
    if (event.operationId) {
      decisions.push({ operationId: event.operationId, action: 'warn-timeout' });
    }
  }

  return decisions;
}
