"use client";

import React, { useState, useEffect } from "react";
import { Lock, CheckCircle2, Loader2 } from "lucide-react";
import { formatDateInTimeZone } from "@/lib/time";

interface Subscription {
  id: string;
  module: string;
  status: string;
  billingCycle: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd: string | null;
}

const MODULES = [
  {
    key: "visibility",
    name: "智見",
    description: "AI搜索可见性分析与品牌监控",
    features: ["品牌提及追踪", "AI可见性得分", "竞品对比分析", "AI优化建议"],
  },
  {
    key: "content",
    name: "智創",
    description: "AI驱动的内容创作与管理",
    features: ["智能内容创作", "多平台发布", "质量评分系统", "SEO/GEO优化"],
  },
];

export default function BillingSettingsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/billing/subscriptions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.subscriptions) {
          setSubscriptions(data.subscriptions);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isActive = (module: string) =>
    subscriptions.some((s) => s.module === module && s.status === "active");

  return (
    <div className="space-y-6">
      <h2
        className="text-lg font-semibold"
        style={{
          color: "var(--text-primary)",
          fontFamily: "var(--font-display)",
        }}
      >
        订阅管理
      </h2>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-48 rounded-xl animate-skeleton-pulse"
              style={{ background: "var(--bg-hover)" }}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MODULES.map((mod) => {
            const active = isActive(mod.key);
            const sub = subscriptions.find(
              (s) => s.module === mod.key && s.status === "active"
            );

            return (
              <div
                key={mod.key}
                className="rounded-xl p-6"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${active ? "var(--color-success)" : "var(--border)"}`,
                  opacity: active ? 1 : 0.8,
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3
                    className="text-base font-semibold"
                    style={{
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {mod.name}
                  </h3>
                  {active ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: "var(--color-success)20",
                        color: "var(--color-success)",
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      已激活
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: "var(--bg-hover)",
                        color: "var(--text-muted)",
                      }}
                    >
                      <Lock className="w-3 h-3" />
                      未订阅
                    </span>
                  )}
                </div>

                {/* Description */}
                <p
                  className="text-sm mb-4"
                  style={{
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {mod.description}
                </p>

                {/* Features */}
                <ul className="space-y-2 mb-6">
                  {mod.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span
                        className="w-1 h-1 rounded-full shrink-0"
                        style={{
                          background: active
                            ? "var(--color-success)"
                            : "var(--text-muted)",
                        }}
                      />
                      <span
                        className="text-sm"
                        style={{
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-body)",
                        }}
                      >
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Period info */}
                {sub && (
                  <p
                    className="text-xs mb-3"
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    有效期至{" "}
                    {formatDateInTimeZone(sub.currentPeriodEnd, { includeTime: false, includeYear: true })}
                  </p>
                )}

                {/* CTA */}
                {active ? (
                  <button
                    className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: "var(--bg-elevated)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--bg-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "var(--bg-elevated)")
                    }
                  >
                    管理订阅
                  </button>
                ) : (
                  <button
                    className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: "var(--color-primary)",
                      color: "#0b0d14",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "var(--color-primary-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "var(--color-primary)")
                    }
                  >
                    联系销售
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
