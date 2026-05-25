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
import { tooltipStyles, axisTickStyles, axisLineStyles, tickLineStyles, gridStyles, legendStyles, chartMargin } from "./shared";

interface StructureBarChartProps {
  data: Record<string, any>[];
}

export default function StructureBarChart({ data }: StructureBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={chartMargin}
      >
        <CartesianGrid {...gridStyles} />
        <XAxis
          dataKey="period"
          tick={axisTickStyles}
          axisLine={axisLineStyles}
          tickLine={tickLineStyles}
        />
        <YAxis
          tick={axisTickStyles}
          axisLine={axisLineStyles}
          tickLine={tickLineStyles}
        />
        <Tooltip contentStyle={tooltipStyles} />
        <Legend wrapperStyle={legendStyles} />
        <Bar dataKey="structured" name="结构化" stackId="a" fill="var(--color-primary)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="semi_structured" name="半结构化" stackId="a" fill="var(--color-primary-dim)" />
        <Bar dataKey="unstructured" name="非结构化" stackId="a" fill="var(--bg-hover)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
