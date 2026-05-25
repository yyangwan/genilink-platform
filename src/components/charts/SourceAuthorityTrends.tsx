"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { tooltipStyles, axisTickStyles, axisLineStyles, tickLineStyles, gridStyles, legendStyles, chartMargin, PLATFORM_COLORS } from "./shared";

interface SourceAuthorityPoint {
  date: string;
  sources: { source: string; authority: number }[];
}

interface SourceAuthorityTrendsProps {
  data: SourceAuthorityPoint[];
}

export default function SourceAuthorityTrends({ data }: SourceAuthorityTrendsProps) {
  if (!data || data.length === 0) return null;

  // Collect unique source names
  const sourceNames = [...new Set(data.flatMap((d) => d.sources.map((s) => s.source)))].slice(0, 6);

  // Transform to chart format: { date, source1: authority, source2: authority, ... }
  const chartData = data.map((d) => {
    const row: Record<string, unknown> = { date: d.date };
    for (const s of d.sources) {
      if (sourceNames.includes(s.source)) {
        row[s.source] = s.authority;
      }
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={chartMargin}>
        <CartesianGrid {...gridStyles} />
        <XAxis
          dataKey="date"
          tick={axisTickStyles}
          axisLine={axisLineStyles}
          tickLine={tickLineStyles}
        />
        <YAxis
          tick={axisTickStyles}
          axisLine={axisLineStyles}
          tickLine={tickLineStyles}
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}`}
        />
        <Tooltip contentStyle={tooltipStyles} />
        <Legend wrapperStyle={legendStyles} />
        {sourceNames.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={PLATFORM_COLORS[i % PLATFORM_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
