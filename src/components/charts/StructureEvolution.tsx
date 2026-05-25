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

interface StructureEvolutionPoint {
  period: string;
  structured: number;
  semi_structured: number;
  unstructured: number;
}

interface StructureEvolutionProps {
  data: StructureEvolutionPoint[];
}

export default function StructureEvolution({ data }: StructureEvolutionProps) {
  if (!data || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={chartMargin}>
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
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip contentStyle={tooltipStyles} formatter={(value) => [`${value}%`]} />
        <Legend wrapperStyle={legendStyles} />
        <Bar dataKey="structured" name="结构化" stackId="a" fill="var(--color-primary)" />
        <Bar dataKey="semi_structured" name="半结构化" stackId="a" fill="var(--color-primary-dim, var(--color-warning))" />
        <Bar dataKey="unstructured" name="非结构化" stackId="a" fill="var(--bg-hover)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
