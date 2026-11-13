/**
 * 匿名访客会话。
 *
 * 首次启动即用 POST /visitor-sessions 换取 visitorToken 并持久化；
 * 令牌临近/已过期时自动刷新（带并发去重，避免并行页面重复建会话）。
 * 登出时由 auth.ts 调 resetVisitor() 重新生成全新访客身份。
 */

import { readString, write, remove, StorageKeys } from './storage';
import { request } from './request';

export interface VisitorSession {
  visitorToken: string;
  expiresAt: string;
}

/** 渠道标识：小程序内默认 wechat_mini_program，可被扫码等入口覆盖。 */
const DEFAULT_CHANNEL = 'wechat_mini_program';

let inflight: Promise<void> | undefined;

function isExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return true;
  const ts = new Date(expiresAt).getTime();
  if (isNaN(ts)) return true;
  // 提前 60 秒视为过期，避免临界请求失败。
  return Date.now() >= ts - 60 * 1000;
}

function createVisitorSession(channel?: string): Promise<void> {
  return request<VisitorSession, { channel?: string }>({
    path: '/visitor-sessions',
    method: 'POST',
    auth: 'none',
    data: channel ? { channel } : {},
    timeoutMs: 12000
  }).then((res) => {
    write(StorageKeys.visitorToken, res.visitorToken);
    write(StorageKeys.visitorExpiresAt, res.expiresAt);
  });
}

/** 确保本地存在有效访客令牌（并发调用共享同一次请求）。 */
export function ensureVisitor(channel?: string): Promise<void> {
  const token = readString(StorageKeys.visitorToken);
  const expiresAt = readString(StorageKeys.visitorExpiresAt);
  if (token && !isExpired(expiresAt)) return Promise.resolve();
  if (inflight) return inflight;

  const effectiveChannel = channel || readString(StorageKeys.visitorChannel) || DEFAULT_CHANNEL;
  inflight = createVisitorSession(effectiveChannel)
    .then(() => {
      write(StorageKeys.visitorChannel, effectiveChannel);
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

export function visitorToken(): string | undefined {
  return readString(StorageKeys.visitorToken);
}

/** 登出后调用：丢弃旧访客身份，下次 ensureVisitor 会建立全新访客。 */
export function resetVisitor(): Promise<void> {
  remove(StorageKeys.visitorToken);
  remove(StorageKeys.visitorExpiresAt);
  return ensureVisitor();
}
