'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LeadActions({ id, version, status }: { id: string; version: number; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function update(nextStatus: string) {
    setPending(true); setError('');
    const response = await fetch(`/api/ops/leads/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, status: nextStatus }),
    });
    if (response.status === 409) setError('线索已被其他运营人员更新，请刷新后重试。');
    else if (!response.ok) setError('状态更新失败');
    else router.refresh();
    setPending(false);
  }
  return <div className="space-y-2"><label className="block text-sm">跟进状态<select disabled={pending} value={status} onChange={(e) => update(e.target.value)} className="ml-3 rounded border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2"><option value="new">新线索</option><option value="qualified">已确认</option><option value="contacted">已联系</option><option value="proposal">方案中</option><option value="won">已成交</option><option value="lost">已流失</option></select></label>{error ? <p className="text-sm text-[var(--color-error)]">{error}</p> : null}</div>;
}
