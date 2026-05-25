"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { tooltipStyles, legendStyles } from "./shared";

interface CompareRadarChartProps {
  labelA: string;
  dataA: { platform: string; score: number }[];
  labelB: string;
  dataB: { platform: string; score: number }[];
}

export default function CompareRadarChart({ labelA, dataA, labelB, dataB }: CompareRadarChartProps) {
  // Merge both datasets by platform name
  const allPlatforms = [...new Set([...dataA.map((d) => d.platform), ...dataB.map((d) => d.platform)])];
  const merged = allPlatforms.map((platform) => ({
    platform,
    [labelA]: dataA.find((d) => d.platform === platform)?.score ?? 0,
    [labelB]: dataB.find((d) => d.platform === platform)?.score ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={merged} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis
          dataKey="platform"
          tick={{ fontSize: 11, fill: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "var(--border)" }}
        />
        <Tooltip contentStyle={tooltipStyles} />
        <Legend wrapperStyle={legendStyles} />
        <Radar
          name={labelA}
          dataKey={labelA}
          stroke="var(--color-primary)"
          fill="var(--color-primary)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
        <Radar
          name={labelB}
          dataKey={labelB}
          stroke="var(--color-warning)"
          fill="var(--color-warning)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
