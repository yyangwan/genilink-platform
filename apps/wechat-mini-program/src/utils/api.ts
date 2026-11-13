/**
 * 后端接口的类型定义与调用封装。
 * 路径约定：所有 path 相对 /api/mini-program/v1（由 request.ts 拼接）。
 */

import { request } from './request';
import { ensureVisitor } from './visitor';
import { readJson, write, StorageKeys } from './storage';

export type CheckStatus = 'running' | 'completed' | 'failed';
export type CheckVerdict = 'pass' | 'issue' | 'unknown';

export interface CheckItem {
  key: string;
  status: CheckVerdict;
  evidence?: string;
  action?: string;
}

export interface PriorityFinding {
  key: string;
  title: string;
  evidence?: string;
  action?: string;
}

export interface QuickCheckReport {
  id: string;
  targetUrl: string;
  status: CheckStatus;
  result?: {
    checkedAt: string;
    finalHost?: string;
    ruleVersion: string;
    checks: CheckItem[];
    priorityFinding?: PriorityFinding;
  };
  errorCode?: string;
  retryable?: boolean;
  saved: boolean;
}

export interface HistoryResponse {
  items: QuickCheckReport[];
  nextCursor?: string;
}

/** 首次提交体检（带幂等键：等待/重试/恢复共用）。 */
export function submitQuickCheck(url: string, idempotencyKey: string): Promise<QuickCheckReport> {
  return ensureVisitor().then(() =>
    request<QuickCheckReport, { url: string }>({
      path: '/quick-checks',
      method: 'POST',
      auth: 'visitor',
      data: { url },
      idempotencyKey
    })
  );
}

/** 查询检测进度/结果（匿名访客或已登录会话均可）。 */
export function getQuickCheck(id: string, auth: 'visitor' | 'session' = 'visitor'): Promise<QuickCheckReport> {
  return auth === 'session'
    ? request<QuickCheckReport>({ path: '/quick-checks/' + id, auth: 'session' })
    : ensureVisitor().then(() => request<QuickCheckReport>({ path: '/quick-checks/' + id, auth: 'visitor' }));
}

/** 标记「已查看证据详情」（结果页展开证据时上报一次）。 */
export function markQuickCheckViewed(id: string, auth: 'visitor' | 'session' = 'visitor'): Promise<void> {
  const send = (): Promise<void> =>
    request<void, Record<string, never>>({
      path: '/quick-checks/' + id + '/view',
      method: 'POST',
      auth,
      data: {}
    }).then(() => undefined);
  return auth === 'session' ? send() : ensureVisitor().then(send);
}

/** 把匿名检测认领到当前账号（登录后「保存」动作）。 */
export function claimQuickCheck(id: string): Promise<QuickCheckReport> {
  return request<QuickCheckReport, Record<string, never>>({
    path: '/quick-checks/' + id + '/claim',
    method: 'POST',
    auth: 'session',
    data: {}
  });
}

/** 报告历史（游标分页）。 */
export function listMyQuickChecks(cursor?: string): Promise<HistoryResponse> {
  const path = cursor ? '/me/quick-checks?cursor=' + encodeURIComponent(cursor) : '/me/quick-checks';
  return request<HistoryResponse>({ path, auth: 'session' });
}

export interface BrandAssessmentInput {
  brand: string;
  scenario: string;
  contact: string;
  contactConsent: true;
  privacyVersion: string;
}

export interface BrandAssessmentResult {
  leadId: string;
  withdrawalToken: string;
}

/** 提交品牌评估（需独立幂等键）。 */
export function submitBrandAssessment(
  checkId: string,
  input: BrandAssessmentInput,
  idempotencyKey: string
): Promise<BrandAssessmentResult> {
  return request<BrandAssessmentResult, BrandAssessmentInput>({
    path: '/quick-checks/' + checkId + '/brand-assessment',
    method: 'POST',
    auth: 'session',
    data: input,
    idempotencyKey
  });
}

/** 撤回品牌评估线索。 */
export function withdrawBrandAssessment(checkId: string, leadId: string, withdrawalToken: string): Promise<void> {
  return request<void, { withdrawalToken: string }>({
    path: '/quick-checks/' + checkId + '/brand-assessment/' + leadId,
    method: 'DELETE',
    auth: 'session',
    data: { withdrawalToken }
  }).then(() => undefined);
}

/* ------------------------- 待认领（保存）队列 ------------------------- */

/** 登录前产生的匿名检测 id，登录成功后逐个 claim。 */
export function queuePendingClaim(checkId: string): void {
  const ids = readJson<string[]>(StorageKeys.pendingClaimIds) || [];
  if (ids.indexOf(checkId) === -1) {
    ids.push(checkId);
    write(StorageKeys.pendingClaimIds, ids);
  }
}

export function takePendingClaims(): string[] {
  const ids = readJson<string[]>(StorageKeys.pendingClaimIds) || [];
  write(StorageKeys.pendingClaimIds, []);
  return ids;
}
