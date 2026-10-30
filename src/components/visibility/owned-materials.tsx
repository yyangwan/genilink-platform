"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import type { EvidenceRun } from '@/types/intelligence';

export interface OwnedAsset {
  id: string; asset_key: string; version: number; registry_brand_id: string; target_id: string;
  title: string; source_kind: 'url' | 'text'; url: string | null; status: string; is_latest: boolean;
  material_hash: string | null; job_state: string | null; error_code: string | null;
  verification: { version: number; decision: string; scope?: string; actor_id?: string; reviewed_at?: string; text_length?: number };
}
interface Fact { id: string; version: number; fact_key: string; statement: string; scope: string; status: string;
  source_kind: string; source_ref: { asset_id?: string }; valid_from: string; valid_until: string }
const statuses: Record<string, string> = { queued: '等待取得', retry_wait: '等待重试', blocked: '访问受限', failed: '取得失败', captured: '原文已保存' };
const decisions: Record<string, string> = { unreviewed: '原文待核实', verified: '材料已核实', rejected: '核实未通过' };
const factsLabel: Record<string, string> = { valid: '有效', needs_review: '待重新核对', expired: '已过期', scheduled: '尚未生效', superseded: '已有新版本', withdrawn: '已撤回' };
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const active = (row: OwnedAsset) => ['queued', 'leased', 'retry_wait'].includes(row.job_state || '');

export function materialSpan(text: string, quote: string) {
  const start = text.indexOf(quote);
  if (!quote.trim() || start < 0 || text.indexOf(quote, start + 1) >= 0) throw Error('事实必须逐字来自保存的材料原文；重复片段请补充上下文。');
  const offset = Array.from(text.slice(0, start)).length;
  return { quote, start: offset, end: offset + Array.from(quote).length };
}

export function OwnedMaterials({ run, projectId, onSaved }: { run: EvidenceRun; projectId: string; onSaved: () => void }) {
  const [items, setItems] = useState<OwnedAsset[]>([]), [next, setNext] = useState<number | null>(null);
  const [selection, setSelected] = useState<OwnedAsset | null>(null), [form, setForm] = useState(false), [revision, setRevision] = useState<OwnedAsset | null>(null);
  const [brand, setBrand] = useState(''), [title, setTitle] = useState(''), [url, setUrl] = useState(''), [input, setInput] = useState('');
  const [quote, setQuote] = useState(''), [scope, setScope] = useState('');
  const [from, setFrom] = useState(() => localDate(new Date())), [until, setUntil] = useState(() => localDate(new Date(Date.now() + 30 * 86400000)));
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [refresh, setRefresh] = useState(0);
  const [materialRead, setMaterialRead] = useState({ key: '', text: '', error: '' });
  const [factRead, setFactRead] = useState<{ key: string; facts: Fact[]; error: string }>({ key: '', facts: [], error: '' });
  const selected = items.find(row => row.id === selection?.id) || selection;
  const readKey = `${selected?.id}:${selected?.status}:${refresh}`;
  const text = materialRead.key === readKey ? materialRead.text : '';
  const facts = factRead.key === readKey ? factRead.facts : [];
  const textError = (materialRead.key === readKey ? materialRead.error : '') || (factRead.key === readKey ? factRead.error : '');
  const pending = useRef<string | null>(null), alive = useRef(true);
  const brands = run.summary.brand_presence?.targets.filter(row => row.role === 'own' && row.registry_brand_id) || [];
  const endpoint = '/api/integration/intelligence/materials';
  const address = useCallback((extra: Record<string, string> = {}) => endpoint + '?' + new URLSearchParams({ projectId, ...extra }), [projectId]);
  const load = useCallback(async (offset = 0) => {
    const response = await fetch(address({ offset: String(offset) }), { cache: 'no-store' });
    if (!response.ok) throw Error('材料读取失败，请刷新重试。');
    const data = await response.json() as { items: OwnedAsset[]; next_offset: number | null };
    if (!alive.current) return;
    setItems(previous => offset ? [...previous.filter(row => !data.items.some(item => item.id === row.id)), ...data.items] : data.items);
    setNext(data.next_offset); setLoaded(true);
  }, [address]);
  useEffect(() => {
    alive.current = true;
    load().catch(err => { if (alive.current) setError(err.message); });
    return () => { alive.current = false; };
  }, [load]);
  useEffect(() => {
    if (!items.some(active)) return;
    const timer = setInterval(() => { load().catch(() => { if (alive.current) setError('状态更新暂未完成，可手动刷新。'); }); }, 5000);
    return () => clearInterval(timer);
  }, [items, load]);
  useEffect(() => {
    if (!selected) return;
    const key = `${selected.id}:${selected.status}:${refresh}`;
    const controller = new AbortController();
    if (selected.status === 'captured') fetch(address({ op: 'text', assetId: selected.id }), { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw Error(); return response.json() as Promise<{ text: string }>; })
      .then(data => { if (!controller.signal.aborted) setMaterialRead({ key, text: data.text, error: '' }); })
      .catch(() => { if (!controller.signal.aborted) setMaterialRead({ key, text: '', error: '原文暂不可读，请关闭后重新打开，核对存储完整性。' }); });
    fetch(address({ op: 'assetFacts', assetId: selected.id }), { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw Error(); return response.json() as Promise<{ facts: Fact[] }>; })
      .then(data => { if (!controller.signal.aborted) setFactRead({ key, facts: data.facts, error: '' }); })
      .catch(() => { if (!controller.signal.aborted) setFactRead({ key, facts: [], error: '事实读取失败，请刷新记录后再操作。' }); });
    return () => controller.abort();
  }, [selected?.id, selected?.status, address, refresh]);
  const send = async (body?: Record<string, unknown>) => {
    if (busy) return;
    if (!pending.current && body) pending.current = JSON.stringify({ projectId, ...body, idempotencyKey: crypto.randomUUID() });
    if (!pending.current) return;
    const request = JSON.parse(pending.current) as Record<string, unknown>;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: pending.current });
      if (!response.ok) {
        if (response.status >= 500) throw Error();
        pending.current = null; setUncertain(false);
        setError(response.status === 409 ? '材料或审核版本已变化，请刷新记录，核对最新版本后再提交。' : '操作未保存，请核对归属品牌、原文、有效期和权限。');
        await load(); return;
      }
      const data = await response.json();
      if (!alive.current) return;
      pending.current = null; setUncertain(false); setForm(false); setRefresh(value => value + 1);
      if (request.op === 'register') { setSelected(data as OwnedAsset); setScope(''); setQuote(''); }
      setMessage('已保存。材料与事实分别记录；新的分析修订会使用更新，旧审计结果保留。');
      await load(); onSaved();
    } catch { if (alive.current) {
      if (pending.current) { setUncertain(true); setError('操作结果尚未确认，请按原请求重试，避免重复创建。'); }
      else setError(old => old || '决定已保存，记录刷新暂未完成，请手动刷新。');
    } }
    finally { if (alive.current) setBusy(false); }
  };
  const startRegistration = (old?: OwnedAsset) => {
    setRevision(old || null); setBrand(old?.registry_brand_id || brands[0]?.registry_brand_id || '');
    setTitle(old?.title || ''); setUrl(old?.url || ''); setInput(''); setMessage(''); setForm(true);
  };
  const approve = () => {
    if (!selected || !text || !selected.material_hash) return;
    try {
      const evidence = materialSpan(text, quote);
      if (Array.from(scope.trim()).length < 5 || !from || !until || Date.parse(until) <= Date.parse(from)) throw Error('请填写适用范围、核实依据及正确的事实有效期。');
      const old = facts.filter(row => row.statement === quote && row.scope === scope.trim()).sort((a, b) => b.version - a.version)[0];
      send({ op: 'approveFact', assetId: selected.id, ...evidence, scope: scope.trim(), reason: scope.trim(),
        materialHash: selected.material_hash, expectedVersion: old?.version || 0,
        expectedVerificationVersion: selected.verification.version, validFrom: new Date(from).toISOString(), validUntil: new Date(until).toISOString() });
    } catch (err) { setError(err instanceof Error ? err.message : '请核对事实原文'); }
  };
  const selectedFacts = selected ? facts.filter(row => row.source_kind === 'owned_asset_revision' && row.source_ref.asset_id === selected.id) : [];
  const locked = busy || uncertain;
  return <section className="citation-stack" aria-label="我方材料与事实">
    <div className="citation-panel citation-pad"><div className="citation-section-head"><div><h2>我方材料与已批准事实</h2><p className="citation-muted">尚未取得、未核实与已批准分开；资料缺失保持未知。</p></div>
      <button className="dashboard-button dashboard-button--primary" disabled={locked || !brands.length} onClick={() => startRegistration()}>登记我方材料</button></div>
      {!brands.length && <p className="citation-notice">请先在品牌身份与项目名单中确认自有品牌。</p>}
      {!loaded && !error && <p role="status">正在读取材料…</p>}
      {items.map(row => <article key={row.id} className="citation-panel citation-pad mt-4"><div className="citation-section-head"><div><h3>{row.title}</h3>
        <p className="citation-muted">版本 {row.version} · {brands.find(brand => brand.registry_brand_id === row.registry_brand_id)?.name || '历史归属品牌'} · {row.source_kind === 'text' ? '文字资料' : '公开页面'}{row.is_latest ? '' : ' · 历史版本'}</p></div>
        <span className="citation-tag">{row.status === 'captured' ? decisions[row.verification.decision] || '原文待核实' : statuses[row.status] || '待处理'}</span></div>
        {row.url && <p className="citation-muted break-all">{row.url}</p>}
        <button className="citation-link" onClick={() => { setSelected(row); setScope(''); setQuote(''); setMessage(''); }}>查看材料与事实 →</button></article>)}
      {loaded && !items.length && <p className="citation-empty">尚未登记我方材料。可添加官网产品说明、案例或合法取得的文字资料。</p>}
      {next !== null && <button className="citation-link mt-4" onClick={() => load(next).catch(err => setError(err.message))}>继续查看材料版本</button>}
      <button className="citation-link mt-4 ml-4" disabled={busy} onClick={() => { setRefresh(value => value + 1); load().catch(err => setError(err.message)); }}>刷新记录</button>
    </div>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {uncertain && <button className="dashboard-button dashboard-button--primary" disabled={busy} onClick={() => send()}>按原请求重试</button>}
    {form && <ReadingDrawer title={revision ? '登记新的材料版本' : '登记我方材料'} eyebrow="我方材料" variant="modal" onClose={() => setForm(false)}>
      <fieldset disabled={locked} className="space-y-4"><label className="block">归属品牌<select className="audit-select mt-2 w-full" value={brand} disabled={!!revision} onChange={event => setBrand(event.target.value)}>
        <option value="">选择自有品牌</option>{brands.map(row => <option key={row.target_id} value={row.registry_brand_id!}>{row.name}</option>)}</select></label>
        <label className="block">材料名称<input className="dashboard-input mt-2 w-full" value={title} maxLength={300} onChange={event => setTitle(event.target.value)} /></label>
        <label className="block">公开页面 URL（可不填）<input type="url" className="dashboard-input mt-2 w-full" value={url} maxLength={4096} onChange={event => setUrl(event.target.value)} placeholder="https://brand.example.com/specs" /></label>
        <label className="block">文字材料（与 URL 至少填写一项）<textarea rows={8} className="dashboard-input mt-2 min-h-40 w-full" value={input} maxLength={200000} onChange={event => setInput(event.target.value)} /></label>
        <p className="citation-muted">同时填写时保存你提供的文字，URL 作为参考地址；仅填 URL 时后台取得公开正文。新版本需要重新核实。</p>
        <button className="dashboard-button dashboard-button--primary" disabled={!brand || !title.trim() || !url.trim() && !input.trim()} onClick={() => send({ op: 'register', registryBrandId: brand, title, url: url.trim() || null, text: input || null, assetKey: revision?.asset_key || null, expectedVersion: revision?.version || 0 })}>{busy ? '正在保存…' : '登记并查看取得状态'}</button>
      </fieldset>{error && <p role="alert">{error}</p>}
    </ReadingDrawer>}
    {selected && !form && <ReadingDrawer title={selected.title + ' · 材料与事实'} eyebrow="我方材料" onClose={() => setSelected(null)}>
      <p className="citation-muted">版本 {selected.version} · {selected.is_latest ? '当前版本' : '历史版本'} · {selected.status === 'captured' ? decisions[selected.verification.decision] : statuses[selected.status]}</p>
      {selected.status !== 'captured' ? <><p className="citation-notice">{active(selected) ? '材料已登记，正在等待取得正文。' : '本次未取得可用正文，可在站点恢复后重试，或登记合法取得的文字作为新版本。'}</p>
        {!active(selected) && selected.is_latest && <button className="dashboard-button dashboard-button--secondary" disabled={locked} onClick={() => send({ op: 'retry', assetId: selected.id, reason: '来源站点恢复后重新取得公开材料' })}>重新取得公开正文</button>}</>
        : <><h3 className="mt-4">保存的材料原文</h3>{textError ? <p role="alert">{textError}</p> : !text ? <p role="status">正在读取原文…</p> : <blockquote className="whitespace-pre-wrap break-words">{text}</blockquote>}
          <p className="citation-muted mt-4">核对归属、版本及限制条件。核实材料不等于批准全部产品说法。</p>
          <fieldset disabled={locked || !text || !!textError || !selected.is_latest} className="space-y-4 mt-4">
            <label className="block">适用范围与核实依据<textarea rows={4} className="dashboard-input mt-2 min-h-24 w-full" maxLength={1000} value={scope} onChange={event => setScope(event.target.value)} placeholder="说明适用产品、客户和限制，并记录核实依据" /></label>
            {selected.verification.decision !== 'verified' ? <button className="dashboard-button dashboard-button--primary" disabled={Array.from(scope.trim()).length < 5} onClick={() => send({ op: 'verify', assetId: selected.id, expectedVersion: selected.verification.version,
              materialHash: selected.material_hash, decision: 'verified', scope: scope.trim(), reason: scope.trim() })}>核实此材料版本</button>
              : <><label className="block">拟批准事实（逐字原文）<textarea rows={4} className="dashboard-input mt-2 min-h-24 w-full" maxLength={2000} value={quote} onChange={event => setQuote(event.target.value)} /></label>
                <div className="grid gap-4 sm:grid-cols-2"><label>事实生效时间<input className="dashboard-input mt-2 w-full" type="datetime-local" value={from} onChange={event => setFrom(event.target.value)} /></label>
                  <label>事实有效截止<input className="dashboard-input mt-2 w-full" type="datetime-local" value={until} onChange={event => setUntil(event.target.value)} /></label></div>
                <button className="dashboard-button dashboard-button--primary" disabled={!quote.trim() || Array.from(scope.trim()).length < 5} onClick={approve}>批准本条事实</button>
                <button className="citation-link ml-4" disabled={Array.from(scope.trim()).length < 5} onClick={() => send({ op: 'verify', assetId: selected.id, expectedVersion: selected.verification.version, materialHash: selected.material_hash, decision: 'rejected', scope: scope.trim(), reason: scope.trim() })}>撤销此版本核实</button></>}
          </fieldset>
          {selectedFacts.map(fact => <div className="citation-panel citation-pad mt-4" key={fact.id}><blockquote>{fact.statement}</blockquote><p>{factsLabel[fact.status] || '待核对'} · 事实版本 {fact.version}</p><p className="citation-muted">{fact.scope}</p>
            <p className="citation-muted">有效期 {new Date(fact.valid_from).toLocaleString('zh-CN')} 至 {new Date(fact.valid_until).toLocaleString('zh-CN')}</p>
            {['valid', 'scheduled', 'needs_review', 'expired'].includes(fact.status) && <button className="citation-link" disabled={locked || Array.from(scope.trim()).length < 5} onClick={() => send({ op: 'withdrawFact', factId: fact.id, expectedVersion: fact.version, reason: scope.trim() })}>按上述依据撤回事实</button>}</div>)}
        </>}
      {selected.is_latest && <button className="citation-link mt-4" disabled={locked} onClick={() => startRegistration(selected)}>登记新版本 →</button>}
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {uncertain && <button className="dashboard-button dashboard-button--primary" disabled={busy} onClick={() => send()}>按原请求重试</button>}
    </ReadingDrawer>}
  </section>;
}
