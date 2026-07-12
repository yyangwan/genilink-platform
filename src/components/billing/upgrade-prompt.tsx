import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";

interface UpgradePromptProps {
  module: "visibility" | "content";
}

const MODULE_INFO: Record<
  "visibility" | "content",
  { name: string; features: string[] }
> = {
  visibility: {
    name: "可见性",
    features: [
      "AI 搜索可见性监控",
      "品牌提及追踪",
      "竞品对比分析",
      "优化建议与趋势报告",
      "品牌可见性趋势图表",
    ],
  },
  content: {
    name: "创作",
    features: [
      "AI 智能内容创作",
      "多平台一键分发",
      "内容质量评分系统",
      "SEO / GEO 优化建议",
      "内容排期与工作流管理",
    ],
  },
};

export default function UpgradePrompt({ module }: UpgradePromptProps) {
  const info = MODULE_INFO[module];

  return (
    <div
      className="mx-auto max-w-lg rounded-xl p-8"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ background: "var(--color-primary-dim)" }}
        >
          <Lock className="h-5 w-5" style={{ color: "var(--color-primary)" }} />
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
          <p
            className="text-xs"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
            }}
          >
            需要订阅后才能继续使用
          </p>
        </div>
      </div>

      <ul className="mb-8 space-y-3">
        {info.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
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

      <Link
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-colors"
        href={`/settings/billing?module=${module}`}
        style={{
          background: "var(--color-primary)",
          color: "#0b0d14",
          fontFamily: "var(--font-display)",
        }}
      >
        去开通订阅
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

