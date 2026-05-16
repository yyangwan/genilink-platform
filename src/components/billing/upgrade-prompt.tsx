import React from "react";
import { Lock } from "lucide-react";

interface UpgradePromptProps {
  module: "visibility" | "content";
}

const MODULE_INFO: Record<
  "visibility" | "content",
  { name: string; features: string[] }
> = {
  visibility: {
    name: "智見",
    features: [
      "AI搜索可见性实时监控",
      "品牌在豆包、DeepSeek、Kimi等平台的提及追踪",
      "竞品对比分析与排名",
      "AI优化建议与智能报告",
      "品牌可见性趋势图表",
    ],
  },
  content: {
    name: "智創",
    features: [
      "AI智能内容创作",
      "多平台一键发布",
      "内容质量评分系统",
      "SEO与GEO优化建议",
      "内容排期与工作流管理",
    ],
  },
};

export default function UpgradePrompt({ module }: UpgradePromptProps) {
  const info = MODULE_INFO[module];

  return (
    <div
      className="rounded-xl p-8 max-w-lg mx-auto"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Locked module header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: "var(--color-primary-dim)" }}
        >
          <Lock
            className="w-5 h-5"
            style={{ color: "var(--color-primary)" }}
          />
        </div>
        <div>
          <h3
            className="text-lg font-semibold tracking-tight"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            {info.name}
          </h3>
          <span
            className="text-xs"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-display)",
            }}
          >
            需要升级订阅
          </span>
        </div>
      </div>

      {/* Feature list */}
      <ul className="space-y-3 mb-8">
        {info.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "var(--color-primary)" }}
            />
            <span
              className="text-sm"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        className="w-full py-3 rounded-lg text-sm font-semibold transition-colors"
        style={{
          background: "var(--color-primary)",
          color: "#0b0d14",
          fontFamily: "var(--font-display)",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--color-primary-hover)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "var(--color-primary)")
        }
      >
        联系销售
      </button>
    </div>
  );
}
