/**
 * ContentPlatformCapabilitiesV1 — 平台生成能力契约（TS 视图）。
 *
 * 与 contracts/content-platform-capabilities-v1.schema.json 一一对应。
 * Portal 缓存该结果 60 秒；能力接口不可用时使用 FALLBACK_CAPABILITIES（仅四个已实现平台）。
 */

export const CAPABILITIES_SCHEMA_VERSION = 1 as const;

export interface PlatformCapabilityV1 {
  enabled: boolean;
  reason?: string;
  maxConcurrent?: number;
}

export interface PlatformCapabilitiesV1 {
  schemaVersion: 1;
  platforms: Record<string, PlatformCapabilityV1>;
}

/** 编译期保守快照：只开放已确认的四个平台（设计 §10.9）。 */
export const FALLBACK_CAPABILITIES: PlatformCapabilitiesV1 = {
  schemaVersion: 1,
  platforms: {
    wechat: { enabled: true, maxConcurrent: 2 },
    weibo: { enabled: true, maxConcurrent: 2 },
    xiaohongshu: { enabled: true, maxConcurrent: 2 },
    douyin: { enabled: true, maxConcurrent: 2 },
    zhihu: { enabled: false, reason: "generator_not_implemented" },
    toutiao: { enabled: false, reason: "generator_not_implemented" },
  },
};

/** Portal 前端展示用的平台标签（含不支持的平台）。 */
export const PLATFORM_LABELS_V1: Readonly<Record<string, string>> = {
  wechat: "微信公众号",
  weibo: "微博",
  xiaohongshu: "小红书",
  douyin: "抖音",
  zhihu: "知乎",
  toutiao: "今日头条",
};
