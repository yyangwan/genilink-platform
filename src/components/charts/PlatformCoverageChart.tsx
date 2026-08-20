"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import { tooltipStyles, axisTickStyles, axisLineStyles, tickLineStyles, gridStyles } from "./shared";
import { getAiPlatformMeta } from "@/lib/ai-platforms";

interface PlatformCoverageChartProps {
  data: { name: string; score: number }[];
}

function PlatformAxisTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  const meta = getAiPlatformMeta(payload?.value ?? "");

  return (
    <g transform={`translate(${x - 92}, ${y - 9})`}>
      <rect width="18" height="18" rx="5" fill={meta.background} stroke={meta.color} strokeOpacity="0.22" />
      {meta.iconPath ? (
        <image href={meta.iconPath} x="1" y="1" width="16" height="16" preserveAspectRatio="xMidYMid meet" />
      ) : (
        <text x="9" y="12.5" textAnchor="middle" fontSize={meta.glyph.length > 1 ? 7 : 9} fontWeight="700" fill={meta.color}>
          {meta.glyph}
        </text>
      )}
      <text x="24" y="12.5" fontSize="12" fill="var(--text-secondary)" style={{ fontFamily: "var(--font-body)" }}>
        {meta.label}
      </text>
    </g>
  );
}

export default function PlatformCoverageChart({ data }: PlatformCoverageChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data.map((p) => ({ name: getAiPlatformMeta(p.name).label, score: p.score }))}
        layout="vertical"
        margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
      >
        <CartesianGrid {...gridStyles} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={axisTickStyles}
          axisLine={axisLineStyles}
          tickLine={tickLineStyles}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={104}
          tick={<PlatformAxisTick />}
          axisLine={axisLineStyles}
          tickLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyles}
          formatter={(value) => [`${value}%`, "覆盖度"]}
        />
        <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((p, idx) => (
            <Cell
              key={idx}
              fill={p.score >= 60 ? "var(--color-success)" : p.score >= 40 ? "var(--color-warning)" : "var(--color-error)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
