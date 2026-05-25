"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ZAxis,
  ReferenceLine,
} from "recharts";
import { tooltipStyles, axisTickStyles, axisLineStyles, tickLineStyles, gridStyles, legendStyles, chartMargin } from "./shared";

interface CompetitorPosition {
  brand: string;
  score: number;
  visibility: number;
  is_own: boolean;
}

interface CompetitorPositioningMapProps {
  data: CompetitorPosition[];
}

export default function CompetitorPositioningMap({ data }: CompetitorPositioningMapProps) {
  if (!data || data.length === 0) return null;

  // Compute midpoints for quadrant lines
  const avgScore = data.reduce((s, d) => s + d.score, 0) / data.length;
  const avgVisibility = data.reduce((s, d) => s + d.visibility, 0) / data.length;

  const chartData = data.map((d) => ({
    brand: d.brand,
    x: d.score,
    y: d.visibility,
    z: Math.max(d.score * 0.5, 40),
    is_own: d.is_own,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={chartMargin}>
        <CartesianGrid {...gridStyles} />
        <XAxis
          type="number"
          dataKey="x"
          name="评分"
          tick={axisTickStyles}
          axisLine={axisLineStyles}
          tickLine={tickLineStyles}
          domain={[0, 100]}
          label={{ value: "评分", position: "insideBottomRight", offset: -5, style: { fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-body)" } }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="可见度"
          tick={axisTickStyles}
          axisLine={axisLineStyles}
          tickLine={tickLineStyles}
          domain={[0, 100]}
          label={{ value: "可见度", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-body)" } }}
        />
        <ZAxis type="number" dataKey="z" range={[80, 400]} />
        <Tooltip
          contentStyle={tooltipStyles}
          formatter={(value, name) => [value, name === "x" ? "评分" : "可见度"]}
          labelFormatter={(_, payload) => {
            const item = payload?.[0]?.payload;
            return item?.brand ?? "";
          }}
        />
        <Legend wrapperStyle={legendStyles} />
        <ReferenceLine x={avgScore} stroke="var(--border)" strokeDasharray="4 4" />
        <ReferenceLine y={avgVisibility} stroke="var(--border)" strokeDasharray="4 4" />
        <Scatter name="品牌" data={chartData}>
          {chartData.map((entry, idx) => (
            <Cell
              key={idx}
              fill={entry.is_own ? "var(--color-primary)" : "var(--color-warning)"}
              fillOpacity={entry.is_own ? 0.8 : 0.5}
              stroke={entry.is_own ? "var(--color-primary)" : "var(--color-warning)"}
              strokeWidth={entry.is_own ? 2 : 1}
            />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
