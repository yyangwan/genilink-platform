"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { tooltipStyles, axisTickStyles, axisLineStyles, tickLineStyles, gridStyles, chartMargin } from "./shared";
import { getAnswerStructureLabel } from "@/lib/visibility/answer-structure";

interface AnswerStructureChartProps {
  data: { type: string; count: number; percentage: number }[];
}

export default function AnswerStructureChart({ data }: AnswerStructureChartProps) {
  if (!data || data.length === 0) return null;

  const localizedData = data.map((item) => ({
    ...item,
    label: getAnswerStructureLabel(item.type),
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={localizedData}
        layout="vertical"
        margin={chartMargin}
      >
        <CartesianGrid {...gridStyles} horizontal={false} />
        <XAxis
          type="number"
          tick={axisTickStyles}
          axisLine={axisLineStyles}
          tickLine={tickLineStyles}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={axisTickStyles}
          axisLine={axisLineStyles}
          tickLine={tickLineStyles}
          width={80}
        />
        <Tooltip
          contentStyle={tooltipStyles}
          formatter={(value) => [`${value}%`, "占比"]}
        />
        <Bar
          dataKey="percentage"
          fill="var(--color-primary)"
          radius={[0, 4, 4, 0]}
          barSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
