"use client";

/**
 * 平台能力选择器（设计 §16.2）：
 * 显示全部 6 个平台；未实现生成的平台（知乎/今日头条）置灰并说明原因，
 * 禁止选择，也不静默替换为其他平台。
 */

import React from "react";

export interface PlatformPlanEntry {
  platform: string;
  capability: "supported" | "unsupported";
  selected: boolean;
  reason?: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  wechat: "微信公众号",
  weibo: "微博",
  douyin: "抖音",
  xiaohongshu: "小红书",
  toutiao: "今日头条",
  zhihu: "知乎",
};

/** 展示顺序：已支持的平台在前，未支持的置灰项在后。 */
const DISPLAY_ORDER = ["wechat", "weibo", "xiaohongshu", "douyin", "zhihu", "toutiao"];

export function PlatformCapabilitySelect({
  plan,
  onToggle,
  disabled,
}: {
  plan: PlatformPlanEntry[];
  onToggle: (platform: string) => void;
  disabled?: boolean;
}) {
  const byPlatform = new Map(plan.map((entry) => [entry.platform, entry]));
  // 能力表里没有的平台（用户新增选择）默认按支持处理。
  const ordered = DISPLAY_ORDER.map((platform) =>
    byPlatform.get(platform) ?? { platform, capability: "supported" as const, selected: false },
  );

  return (
    <div className="flex flex-wrap gap-2">
      {ordered.map((entry) => {
        const unsupported = entry.capability === "unsupported";
        const active = entry.selected && !unsupported;
        return (
          <button
            key={entry.platform}
            type="button"
            onClick={() => {
              if (!unsupported && !disabled) onToggle(entry.platform);
            }}
            disabled={unsupported || disabled}
            title={unsupported ? entry.reason ?? "当前暂不支持自动生成" : undefined}
            className="dashboard-chip"
            style={{
              background: active
                ? "color-mix(in srgb, var(--color-primary) 12%, transparent)"
                : "var(--bg-card)",
              color: unsupported
                ? "var(--text-tertiary)"
                : active
                  ? "var(--color-primary)"
                  : "var(--text-secondary)",
              border: `1px solid ${active ? "var(--color-primary)" : "var(--border)"}`,
              cursor: unsupported || disabled ? "not-allowed" : "pointer",
              opacity: unsupported ? 0.6 : 1,
            }}
          >
            {PLATFORM_LABELS[entry.platform] ?? entry.platform}
            {unsupported && <span className="ml-1 text-xs">（暂不支持）</span>}
          </button>
        );
      })}
    </div>
  );
}
