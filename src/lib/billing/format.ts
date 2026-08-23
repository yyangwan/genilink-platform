// Money formatting for the checkout UI. All inputs are integer cents.

export function formatCents(cents: number): string {
  const yuan = cents / 100;
  const hasFraction = Math.round(yuan * 100) % 100 !== 0;
  return `¥${yuan.toLocaleString('zh-CN', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
