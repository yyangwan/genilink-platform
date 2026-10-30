"use client";
import { useEffect, useRef, useState } from 'react';
import { SCENARIOS, type Scenario } from '@/lib/visibility/scenarios';

interface PreferencesView { mode: 'neutral' | 'custom'; contextVersion: number; priorityPolicyVersion: string; importance: Record<Scenario, number>; reason: string | null; syncPending: boolean }
export function ScenarioPreferences({ projectId }: { projectId: string }) {
  const [current, setCurrent] = useState<PreferencesView | null>(null), [mode, setMode] = useState<'neutral' | 'custom'>('neutral');
  const [values, setValues] = useState<Partial<Record<Scenario, number>>>({}), [reason, setReason] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const pending = useRef<string | null>(null), live = useRef(true);
  useEffect(() => {
    live.current = true; const controller = new AbortController();
    fetch(`/api/integration/intelligence/preferences?${new URLSearchParams({ projectId })}`, { signal: controller.signal, cache: 'no-store' }).then(async response => { if (!response.ok) throw Error(); return response.json() as Promise<PreferencesView>; }).then(data => { if (controller.signal.aborted) return; setCurrent(data); setMode(data.mode); setValues(data.importance); setReason(data.reason || ''); }).catch(() => { if (!controller.signal.aborted) setError('场景偏好读取失败，请关闭后重新打开。'); });
    return () => { live.current = false; controller.abort(); };
  }, [projectId]);
  const save = async () => {
    if (!current || busy || message) return;
    if (!pending.current) {
      if (Array.from(reason.trim()).length < 5) { setError('请填写至少 5 个字的设置理由。'); return; }
      pending.current = JSON.stringify({ projectId, expectedVersion: current.contextVersion, preferences: { version: 'business-preferences-v1', scenario_importance: mode === 'neutral' ? {} : values, reason: reason.trim() } });
    }
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/integration/intelligence/preferences?${new URLSearchParams({ projectId })}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: pending.current });
      if (!live.current) return;
      if (!response.ok) {
        if ([400, 401, 403, 409, 422].includes(response.status)) { pending.current = null; setUncertain(false); setError(response.status === 409 ? '配置版本已变化，请关闭后重新打开，核对最新偏好。' : '偏好未保存，请核对权限、重要性及设置理由。'); return; }
        throw Error();
      }
      const saved = await response.json() as PreferencesView;
      pending.current = null; setUncertain(false); setCurrent(saved);
      setMessage(`场景偏好已保存，配置版本 ${saved.contextVersion}。${saved.syncPending ? '后台同步尚未确认，已保留待同步记录。' : ''}本次审计评分保持不变。`);
    } catch { if (live.current) { setUncertain(true); setError('尚未确认保存结果，请使用相同请求重试。'); } }
    finally { if (live.current) setBusy(false); }
  };
  return <section className="space-y-4" aria-label="场景重要性设置"><p className="citation-muted">用于优化机会的业务优先级，不改变固定评分权重，也不触发采集或模型调用。</p>
    {!current && !error && <p role="status">正在读取场景偏好…</p>}
    {current && <p className="citation-muted">配置版本 {current.contextVersion} · {current.mode === 'neutral' ? '场景等权（默认）' : '已设置业务偏好'}</p>}
    <fieldset disabled={!current || busy || uncertain || !!message} className="space-y-4"><label className="block">业务偏好<select className="audit-select mt-2 w-full" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="neutral">场景等权（默认）</option><option value="custom">按场景设置重要性</option></select></label>
      <div className="grid gap-4 sm:grid-cols-2">{Object.entries(SCENARIOS).map(([key, label]) => <label className="block" key={key}>{label}<select className="audit-select mt-2 w-full" disabled={mode === 'neutral'} value={values[key as Scenario] ?? 50} onChange={event => setValues(old => ({ ...old, [key]: Number(event.target.value) }))}>{![25, 50, 100].includes(values[key as Scenario] ?? 50) && <option value={values[key as Scenario]}>已配置：{values[key as Scenario]}</option>}<option value="25">低</option><option value="50">中</option><option value="100">高</option></select></label>)}</div>
      <label className="block">设置理由<textarea className="dashboard-input mt-2 min-h-24 w-full" maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
    </fieldset>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!message && <button type="button" className="dashboard-button dashboard-button--primary" disabled={!current || busy} onClick={save}>{busy ? '保存中…' : uncertain ? '使用相同请求重试' : '保存排序偏好'}</button>}
  </section>;
}
