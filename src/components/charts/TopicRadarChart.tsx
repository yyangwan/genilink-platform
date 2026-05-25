"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { tooltipStyles } from "./shared";

interface TopicRadarChartProps {
  data: { topic: string; count: number }[];
}

export default function TopicRadarChart({ data }: TopicRadarChartProps) {
  if (!data || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis
          dataKey="topic"
          tick={{ fontSize: 11, fill: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
        />
        <PolarRadiusAxis
          angle={90}
          tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "var(--border)" }}
        />
        <Tooltip contentStyle={tooltipStyles} />
        <Radar
          name="提及次数"
          dataKey="count"
          stroke="var(--color-primary)"
          fill="var(--color-primary)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
