/**
 * 持久化幂等键。
 *
 * 关键体验点：用户提交一次体检后，无论「等待中重进小程序」「失败后
 * 点重试」还是「换页面再回来」，都复用同一个已持久化的
 * Idempotency-Key 重发 POST /quick-checks，服务端返回同一条检测，
 * 不会重复扣费/重复建任务。品牌评估提交同理。
 */

import { readJson, write, remove, StorageKeys } from './storage';

/** 生成一个不可猜的随机键（时间戳 + 随机段）。 */
function randomKey(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return prefix + '-' + Date.now().toString(36) + '-' + rand;
}

export interface ActiveCheckRecord {
  /** POST /quick-checks 用的幂等键（等待/重试/恢复共用）。 */
  idempotencyKey: string;
  /** 提交的原始 url。 */
  url: string;
  /** 服务端已确认的检测 id（首次成功响应后回填）。 */
  checkId?: string;
  /** 创建时间（展示与清理用）。 */
  createdAt: string;
}

export function loadActiveCheck(): ActiveCheckRecord | undefined {
  return readJson<ActiveCheckRecord>(StorageKeys.activeCheck);
}

export function saveActiveCheck(record: ActiveCheckRecord): void {
  write(StorageKeys.activeCheck, record);
}

/** 开始一次新的检测提交：生成并落盘新幂等键。 */
export function beginCheck(url: string): ActiveCheckRecord {
  const record: ActiveCheckRecord = {
    idempotencyKey: randomKey('qc'),
    url,
    createdAt: new Date().toISOString()
  };
  saveActiveCheck(record);
  return record;
}

export function clearActiveCheck(): void {
  remove(StorageKeys.activeCheck);
}

/**
 * 品牌评估幂等键：按 checkId + 表单内容哈希落盘。
 * 同一检测同一表单的重试共用一个键；用户修改表单后自然换新键。
 */
export interface BrandLeadReceipt {
  leadId: string;
  withdrawalToken: string;
  brand: string;
  scenario: string;
  submittedAt: string;
}

export function brandIdempotencyKey(checkId: string, formFingerprint: string): string {
  const key = 'ba-' + checkId + '-' + formFingerprint;
  const store = readJson<Record<string, string>>(StorageKeys.flags) || {};
  if (typeof store[key] !== 'string') {
    store[key] = randomKey(key);
    write(StorageKeys.flags, store);
  }
  return store[key];
}

export function loadBrandLead(checkId: string): BrandLeadReceipt | undefined {
  const all = readJson<Record<string, BrandLeadReceipt>>(StorageKeys.brandLeads) || {};
  return all[checkId];
}

export function saveBrandLead(checkId: string, receipt: BrandLeadReceipt): void {
  const all = readJson<Record<string, BrandLeadReceipt>>(StorageKeys.brandLeads) || {};
  all[checkId] = receipt;
  write(StorageKeys.brandLeads, all);
}

/** 撤回成功后本地同步清除回执。 */
export function removeBrandLead(checkId: string): void {
  const all = readJson<Record<string, BrandLeadReceipt>>(StorageKeys.brandLeads) || {};
  if (all[checkId]) {
    delete all[checkId];
    write(StorageKeys.brandLeads, all);
  }
}
