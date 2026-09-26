'use client';

import { FormEvent, useEffect, useState } from 'react';

type WithdrawalRecord = { leadId: string; withdrawalToken: string };

export function LeadForm({ kind }: { kind: 'agency' | 'private_deployment' | 'managed_service' }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [withdrawal, setWithdrawal] = useState<WithdrawalRecord | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const storageKey = `genilink-lead-withdrawal:${kind}`;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const value = window.localStorage.getItem(storageKey);
        if (!value) return;
        const record = JSON.parse(value) as Partial<WithdrawalRecord>;
        if (typeof record.leadId === 'string' && typeof record.withdrawalToken === 'string') {
          setWithdrawal({ leadId: record.leadId, withdrawalToken: record.withdrawalToken });
        }
      } catch { /* local storage may be unavailable or malformed */ }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [storageKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch('/api/public/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload, kind, contactConsent: form.get('contactConsent') === 'on',
          privacyVersion: '2026-09-25', submissionToken: crypto.randomUUID(),
        }),
      });
      const result = await response.json() as { error?: string; leadId?: string; withdrawalToken?: string };
      if (!response.ok) throw new Error(result.error || '提交失败');
      if (result.leadId && result.withdrawalToken) {
        const record = { leadId: result.leadId, withdrawalToken: result.withdrawalToken };
        setWithdrawal(record);
        try { window.localStorage.setItem(storageKey, JSON.stringify(record)); } catch { /* optional persistence */ }
      }
      setSuccess(true);
      setMessage('需求已提交，我们会根据项目情况尽快联系你。');
      event.currentTarget.reset();
    } catch (error) {
      setSuccess(false);
      setMessage(error instanceof Error ? error.message : '提交失败，请稍后重试');
    } finally {
      setPending(false);
    }
  }

  async function withdrawContact() {
    if (!withdrawal || !window.confirm('撤回后，已提交的手机号、邮箱和微信号会立即删除，智链将不再依据本次需求联系你。确认撤回吗？')) return;
    setWithdrawing(true);
    setMessage('');
    try {
      const response = await fetch(`/api/public/leads/${encodeURIComponent(withdrawal.leadId)}/contact`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawalToken: withdrawal.withdrawalToken }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '撤回失败');
      setWithdrawal(null);
      setSuccess(true);
      setMessage('联系授权已撤回，已提交的联系方式已删除。');
      try { window.localStorage.removeItem(storageKey); } catch { /* optional persistence */ }
    } catch (error) {
      setSuccess(false);
      setMessage(error instanceof Error ? error.message : '撤回失败，请稍后重试');
    } finally {
      setWithdrawing(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[var(--text-primary)]';
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
      <input name="companyFax" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">公司或团队名称<input className={inputClass} name="companyName" required minLength={2} maxLength={120} /></label>
        <label className="space-y-1 text-sm">官网<input className={inputClass} name="website" type="url" placeholder="https://example.com" /></label>
        <label className="space-y-1 text-sm">手机号<input className={inputClass} name="phone" inputMode="tel" /></label>
        <label className="space-y-1 text-sm">邮箱<input className={inputClass} name="email" type="email" /></label>
        <label className="space-y-1 text-sm">微信号<input className={inputClass} name="wechat" /></label>
        <label className="space-y-1 text-sm">项目规模<select className={inputClass} name="projectCountBand" defaultValue="1-9"><option value="1-9">1–9 个</option><option value="10-49">10–49 个</option><option value="50+">50 个以上</option></select></label>
        <label className="space-y-1 text-sm">计划启动时间<select className={inputClass} name="timeline" defaultValue="within_3_months"><option value="within_1_month">1 个月内</option><option value="within_3_months">3 个月内</option><option value="later">暂未确定</option></select></label>
        <label className="space-y-1 text-sm">预算范围<select className={inputClass} name="budgetBand" defaultValue="custom"><option value="standard">标准订阅</option><option value="enterprise">企业服务</option><option value="custom">需要评估</option></select></label>
      </div>
      <label className="block space-y-1 text-sm">需求说明<textarea className={`${inputClass} min-h-28`} name="requirements" maxLength={2000} /></label>
      <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"><input name="contactConsent" type="checkbox" required className="mt-1" />允许智链团队就本次需求联系我，并同意隐私政策中的必要信息处理。</label>
      <button disabled={pending} className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-3 font-semibold text-[#0b0d14] disabled:opacity-60">{pending ? '提交中…' : '提交需求'}</button>
      {message ? <p role="status" className={success ? 'text-sm text-[var(--color-success)]' : 'text-sm text-[var(--color-error)]'}>{message}</p> : null}
      {withdrawal ? <div className="border-t border-[var(--border)] pt-4 text-sm text-[var(--text-secondary)]"><p>你可以随时撤回本次联系授权并删除已提交的联系方式。</p><button type="button" disabled={withdrawing} onClick={withdrawContact} className="mt-2 rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--text-primary)] disabled:opacity-60">{withdrawing ? '撤回中…' : '撤回联系授权并删除联系方式'}</button></div> : null}
    </form>
  );
}
