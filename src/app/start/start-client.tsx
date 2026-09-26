'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StartClient({ targetUrl }: { targetUrl: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function activate() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/acquisition/activate', { method: 'POST' });
      const result = await response.json() as { error?: string; code?: string; nextUrl?: string };
      if (response.status === 202 && result.code === 'ANALYSIS_RECONCILING') {
        setError('诊断任务正在确认中，请稍后刷新。系统不会重复创建任务。');
        return;
      }
      if (!response.ok || !result.nextUrl) throw new Error(result.error || '暂时无法启动诊断');
      router.replace(result.nextUrl);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '暂时无法启动诊断');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8">
        <p className="mb-2 text-sm text-[var(--text-muted)]">免费官网诊断</p>
        <h1 className="mb-3 text-2xl font-semibold text-[var(--text-primary)]">确认并开始诊断</h1>
        <p className="mb-6 break-all text-sm text-[var(--text-secondary)]">{targetUrl}</p>
        <button
          type="button"
          onClick={activate}
          disabled={pending}
          className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-3 font-semibold text-[#0b0d14] disabled:opacity-60"
        >
          {pending ? '正在创建项目并启动诊断…' : '开始免费诊断'}
        </button>
        {error ? <p role="alert" className="mt-4 text-sm text-[var(--color-error)]">{error}</p> : null}
      </section>
    </main>
  );
}
