/**
 * 私有缓存封装。
 *
 * 统一 key 前缀，登出时只需 clearPrivateCache() 即可把访客令牌、
 * 会话、报告缓存、品牌评估回执一并清除，避免遗留敏感数据。
 * API origin 的选择不属于隐私数据，登出后保留。
 */

const PREFIX = 'mp:';

export const StorageKeys = {
  visitorToken: PREFIX + 'visitor-token',
  visitorExpiresAt: PREFIX + 'visitor-expires-at',
  visitorChannel: PREFIX + 'visitor-channel',
  sessionToken: PREFIX + 'session-token',
  sessionExpiresAt: PREFIX + 'session-expires-at',
  /** 首次提交体检时生成的幂等键（url 换代计数），等待/重试/恢复共用。 */
  activeCheck: PREFIX + 'active-check',
  /** 待认领（保存到账号）的体检 id 列表。 */
  pendingClaimIds: PREFIX + 'pending-claim-ids',
  /** 品牌评估提交回执：checkId -> {leadId, withdrawalToken, brand, submittedAt}。 */
  brandLeads: PREFIX + 'brand-leads',
  /** 登录流程中的中间 bindingToken（仅短信/扫码绑定期间存在）。 */
  bindingToken: PREFIX + 'binding-token',
  bindingExpiresAt: PREFIX + 'binding-expires-at',
  bindingOptions: PREFIX + 'binding-options',
  /** 上次短信验证已确认的手机号（脱敏展示用）。 */
  boundPhoneMasked: PREFIX + 'bound-phone-masked',
  /** 未读提示类一次性标记。 */
  flags: PREFIX + 'flags'
} as const;

export function readString(key: string): string | undefined {
  const value = wx.getStorageSync(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readJson<T>(key: string): T | undefined {
  const value = wx.getStorageSync(key);
  if (value == null || typeof value === 'string') return undefined;
  return value as T;
}

export function write(key: string, value: unknown): void {
  wx.setStorageSync(key, value);
}

export function remove(key: string): void {
  wx.removeStorageSync(key);
}

/** 登出/解绑时调用：清空所有带私有前缀的数据，但保留环境选择。 */
export function clearPrivateCache(): void {
  // clearStorageSync 会连 API origin 选择一起清掉，因此只按前缀逐项删除。
  const info = wx.getStorageInfoSync();
  const keys: string[] = info ? info.keys : [];
  for (const key of keys) {
    if (typeof key === 'string' && key.indexOf(PREFIX) === 0 && key !== PREFIX + 'api-origin') {
      wx.removeStorageSync(key);
    }
  }
}
