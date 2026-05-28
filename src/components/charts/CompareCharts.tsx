"use client";

import React from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { tooltipStyles, legendStyles, BRAND_COLORS, sectionCard } from "@/components/charts/shared";

interface CompareChartsProps {
  radarData: Record<string, unknown>[];
  barData: { brand: string; rate: number; isPrimary: boolean }[];
  brandColumns: string[];
}

export default function CompareCharts({ radarData, barData, brandColumns }: CompareChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Radar chart */}
      <div style={sectionCard}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
          平台维度雷达图
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="platform" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyles} />
            <Legend wrapperStyle={legendStyles} />
            {brandColumns.map((brand, i) => (
              <Radar
                key={brand}
                name={brand}
                dataKey={brand}
                stroke={BRAND_COLORS[i % BRAND_COLORS.length]}
                fill={BRAND_COLORS[i % BRAND_COLORS.length]}
                fillOpacity={i === 0 ? 0.15 : 0.05}
                strokeWidth={2}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Bar chart */}
      <div style={sectionCard}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
          品牌提及率排行
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData} layout="vertical" margin={{ left: 60, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
            <YAxis type="category" dataKey="brand" tick={{ fill: "var(--text-primary)", fontSize: 12 }} width={56} />
            <Tooltip contentStyle={tooltipStyles} formatter={(value: unknown) => [`${value}%`, "提及率"]} />
            <Bar dataKey="rate" radius={[0, 4, 4, 0]} barSize={18}>
              {barData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.isPrimary ? "#00d4aa" : "#4cc9f0"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
