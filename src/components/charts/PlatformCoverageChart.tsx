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

interface PlatformCoverageChartProps {
  data: { name: string; score: number }[];
}

export default function PlatformCoverageChart({ data }: PlatformCoverageChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data.map((p) => ({ name: p.name, score: p.score }))}
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
          width={80}
          tick={{ fontSize: 12, fill: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
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
