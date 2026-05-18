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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={{ stroke: "var(--border)" }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={80}
          tick={{ fontSize: 12, fill: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            fontSize: 13,
            fontFamily: "var(--font-body)",
            color: "var(--text-primary)",
          }}
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
