"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface StructureBarChartProps {
  data: Record<string, any>[];
}

export default function StructureBarChart({ data }: StructureBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={{ stroke: "var(--border)" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={{ stroke: "var(--border)" }}
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
        />
        <Legend wrapperStyle={{ fontSize: 12, fontFamily: "var(--font-body)" }} />
        <Bar dataKey="structured" name="结构化" stackId="a" fill="var(--color-primary)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="semi_structured" name="半结构化" stackId="a" fill="var(--color-primary-dim)" />
        <Bar dataKey="unstructured" name="非结构化" stackId="a" fill="var(--bg-hover)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
