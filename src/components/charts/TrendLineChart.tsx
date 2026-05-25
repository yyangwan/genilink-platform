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

interface TrendLineChartProps {
  chartData: Record<string, any>[];
  platformNames: string[];
}

export default function TrendLineChart({ chartData, platformNames }: TrendLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={chartMargin}>
        <CartesianGrid {...gridStyles} />
        <XAxis
          dataKey="period"
          tick={axisTickStyles}
          axisLine={axisLineStyles}
          tickLine={tickLineStyles}
        />
        <YAxis
          domain={[0, 100]}
          tick={axisTickStyles}
          axisLine={axisLineStyles}
          tickLine={tickLineStyles}
        />
        <Tooltip contentStyle={tooltipStyles} />
        <Legend wrapperStyle={legendStyles} />
        <Line
          type="monotone"
          dataKey="总分"
          stroke="var(--text-primary)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          opacity={0.7}
        />
        {platformNames.map((platform, idx) => (
          <Line
            key={platform}
            type="monotone"
            dataKey={platform}
            stroke={PLATFORM_COLORS[idx % PLATFORM_COLORS.length]}
            strokeWidth={1.5}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
