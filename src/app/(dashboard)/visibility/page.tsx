"use client";

import React from "react";
import { Eye, BarChart3, TrendingUp, AlertCircle } from "lucide-react";

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

export default function VisibilityPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-sectionHeading)",
          }}
        >
          智見
        </h1>
        <p
          className="mt-1 text-sm"
          style={{
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
          }}
        >
          AI搜索可见性分析与品牌监控
        </p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <Eye
              className="w-4 h-4"
              style={{ color: "var(--color-primary)" }}
            />
            <span
              className="text-sm font-medium"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              品牌提及
            </span>
          </div>
          <span
            className="text-2xl font-bold"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            --
          </span>
        </div>
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3
              className="w-4 h-4"
              style={{ color: "var(--color-primary)" }}
            />
            <span
              className="text-sm font-medium"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              平均得分
            </span>
          </div>
          <span
            className="text-2xl font-bold"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            --
          </span>
        </div>
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp
              className="w-4 h-4"
              style={{ color: "var(--color-primary)" }}
            />
            <span
              className="text-sm font-medium"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              竞品排名
            </span>
          </div>
          <span
            className="text-2xl font-bold"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            --
          </span>
        </div>
      </div>

      {/* Empty state */}
      <div style={sectionCard}>
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle
            className="w-10 h-10 mb-3"
            style={{ color: "var(--text-muted)" }}
          />
          <p
            className="text-sm"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
            }}
          >
            请先创建项目以开始可见性分析
          </p>
        </div>
      </div>
    </div>
  );
}
