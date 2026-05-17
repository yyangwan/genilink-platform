"use client";

import React from "react";

interface ScoreGaugeProps {
  score: number;
  size?: number;
  label?: string;
  showPercentile?: boolean;
  percentile?: number;
}

function getScoreColor(score: number): string {
  if (score >= 70) return "var(--color-success)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-error)";
}

function getScoreLabel(score: number): string {
  if (score >= 70) return "良好";
  if (score >= 40) return "一般";
  return "较差";
}

export function ScoreGauge({ score, size = 180, label, showPercentile, percentile }: ScoreGaugeProps) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(Math.max(score, 0), 100) / 100) * circumference;
  const color = getScoreColor(score);
  const scoreLabel = label || getScoreLabel(score);

  return (
    <div className="flex flex-col items-center" role="figure" aria-label={`分数: ${score}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-hover)"
          strokeWidth={strokeWidth}
        />
        {/* Score arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          className="animate-gauge-fill"
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      {/* Score text overlay */}
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span
          style={{
            fontSize: 36,
            fontWeight: 700,
            color,
            fontFamily: "var(--font-display)",
            lineHeight: 1,
          }}
        >
          {score}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-display)",
            marginTop: 4,
          }}
        >
          {scoreLabel}
        </span>
        {showPercentile && percentile != null && (
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
              marginTop: 2,
            }}
          >
            高于 {percentile}% 的品牌
          </span>
        )}
      </div>
    </div>
  );
}
