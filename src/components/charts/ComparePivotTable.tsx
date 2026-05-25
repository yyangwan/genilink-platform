"use client";

interface ComparePivotTableProps {
  labelA: string;
  dataA: { platform: string; score: number; change?: number }[];
  labelB: string;
  dataB: { platform: string; score: number; change?: number }[];
  delta: { platform: string; delta: number }[];
}

export default function ComparePivotTable({ labelA, dataA, labelB, dataB, delta }: ComparePivotTableProps) {
  const allPlatforms = [...new Set([...dataA.map((d) => d.platform), ...dataB.map((d) => d.platform)])];

  const getDelta = (platform: string) => delta.find((d) => d.platform === platform)?.delta ?? 0;
  const scoreCell = (score: number | undefined) => {
    if (score == null) return <span style={{ color: "var(--text-muted)" }}>--</span>;
    const color = score >= 60 ? "var(--color-success)" : score >= 40 ? "var(--color-warning)" : "var(--color-error)";
    return <span style={{ color, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{score}</span>;
  };
  const deltaCell = (d: number) => {
    const color = d > 0 ? "var(--color-success)" : d < 0 ? "var(--color-error)" : "var(--text-muted)";
    const arrow = d > 0 ? "↑" : d < 0 ? "↓" : "→";
    return (
      <span style={{ color, fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 12 }}>
        {arrow} {d > 0 ? "+" : ""}{d}
      </span>
    );
  };

  const thStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    padding: "8px 12px",
    textAlign: "left",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  };

  const tdStyle: React.CSSProperties = {
    fontSize: 13,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    fontFamily: "var(--font-body)",
    color: "var(--text-primary)",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>平台</th>
            <th style={{ ...thStyle, textAlign: "center" }}>{labelA}</th>
            <th style={{ ...thStyle, textAlign: "center" }}>{labelB}</th>
            <th style={{ ...thStyle, textAlign: "center" }}>变化</th>
            <th style={{ ...thStyle, textAlign: "center" }}>状态</th>
          </tr>
        </thead>
        <tbody>
          {allPlatforms.map((platform) => {
            const scoreA = dataA.find((d) => d.platform === platform)?.score;
            const scoreB = dataB.find((d) => d.platform === platform)?.score;
            const d = getDelta(platform);
            const statusIcon = d > 5 ? "✓" : d < -5 ? "✗" : "·";
            const statusColor = d > 5 ? "var(--color-success)" : d < -5 ? "var(--color-error)" : "var(--text-muted)";

            return (
              <tr key={platform}>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 500 }}>{platform}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{scoreCell(scoreA)}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{scoreCell(scoreB)}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{deltaCell(d)}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <span style={{ color: statusColor, fontWeight: 700, fontSize: 14 }}>{statusIcon}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
