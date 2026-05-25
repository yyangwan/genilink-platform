"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { tooltipStyles, legendStyles } from "./shared";

interface SentimentPieChartProps {
  data: { name: string; value: number; fill: string }[];
}

export default function SentimentPieChart({ data }: SentimentPieChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          innerRadius={40}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((entry, idx) => (
            <Cell key={idx} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyles} />
        <Legend wrapperStyle={legendStyles} />
      </PieChart>
    </ResponsiveContainer>
  );
}
