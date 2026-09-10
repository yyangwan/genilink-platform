/**
 * 工作流提交的恢复凭据（评审 R3，设计 §22.1）。
 *
 * 结果不确定（超时/断连/5xx）时，客户端必须保留原幂等键与请求体快照，
 * 刷新后可用同一键安全重放找回 workflowId——ContentOS 幂等回放返回原结果，
 * 不会重复创建或重复扣额。任何新键都会造成第二个工作流与二次计费。
 */

const KEY_PREFIX = 'content-submit:';

export interface PendingSubmission {
  /** 原始幂等键（重试必须复用）。 */
  key: string;
  /** 首次提交的请求体快照（重放哈希必须一致）。 */
  body: Record<string, unknown>;
  savedAt: number;
}

/** 超过 30 分钟的未决提交不再自动恢复（对账早已收敛）。 */
const PENDING_TTL_MS = 30 * 60_000;

function storageKey(briefId: string): string {
  return `${KEY_PREFIX}${briefId}`;
}

export function savePendingSubmission(briefId: string, submission: PendingSubmission): void {
  try {
    sessionStorage.setItem(storageKey(briefId), JSON.stringify(submission));
  } catch {
    // 存储不可用时退化为仅内存保留（submitKeyRef）。
  }
}

export function loadPendingSubmission(briefId: string): PendingSubmission | null {
  try {
    const raw = sessionStorage.getItem(storageKey(briefId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSubmission;
    if (!parsed?.key || typeof parsed.key !== 'string' || !parsed?.body) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > PENDING_TTL_MS) {
      sessionStorage.removeItem(storageKey(briefId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingSubmission(briefId: string): void {
  try {
    sessionStorage.removeItem(storageKey(briefId));
  } catch {
    // 忽略：清除失败不影响正确性。
  }
}
