"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import type { EvidenceRun } from '@/types/intelligence';
import { analysisTargets } from '@/lib/visibility/analysis-scope';
import { readTaskScope, setTaskScope } from '@/lib/visibility/task-view';
import { actionSchema, assetSchema, cohortSchema, observationResultSchema, optionsSchema, retestSchema, chinaTime, ObservationError, observationGet, observationPages, observationPost,
  type ObservationAction, type ObservationCohort, type ObservationResult, type Publication, type PublicationOptions, type Retest } from '@/lib/visibility/observation-contract';
import { PublicationDrawer, publicationChannels } from './publication-drawer';
import { ObservationResults } from './observation-results';
import './observation-workspace.css';

type Operation = { body: Record<string, unknown>; kind: 'create' | 'start' | 'retry' | 'compare' };
const id = z.string().regex(/^[a-f0-9]{32}$/);
export function ObservationWorkspace(props: { projectId: string; run: EvidenceRun; onOpenEvidence: (runId: string, kind: string, id: string) => void; onWriteLock?: (value: boolean) => void }) {
  return <Workspace key={`${props.projectId}:${props.run.id}`} {...props} />;
}
function Workspace({ projectId, run, onOpenEvidence, onWriteLock }: { projectId: string; run: EvidenceRun; onOpenEvidence: (runId: string, kind: string, id: string) => void; onWriteLock?: (value: boolean) => void }) {
  const [actions, setActions] = useState<ObservationAction[]>([]), [cohorts, setCohorts] = useState<ObservationCohort[]>([]), [canWrite, setCanWrite] = useState(false);
  const [actionId, setActionId] = useState(() => typeof window === 'undefined' ? '' : readTaskScope(projectId).action), [selected, setSelected] = useState(() => {
    if (typeof window === 'undefined') return ''; const query = new URLSearchParams(window.location.search);
    return query.get('project') === projectId ? query.get('cohortId') || '' : '';
  });
  const [loadedOptions, setOptions] = useState<PublicationOptions | null>(null), [assets, setAssets] = useState<Publication[]>([]), [assetIds, setAssetIds] = useState<string[]>([]);
  const [targets, setTargets] = useState<string[]>([]), [platforms, setPlatforms] = useState<string[]>([]), [title, setTitle] = useState('');
  const [retests, setRetests] = useState<Retest[]>([]), [results, setResults] = useState<ObservationResult[]>([]), [resultId, setResultId] = useState(''), [retestId, setRetestId] = useState('');
  const [loading, setLoading] = useState(true), [scopeLoading, setScopeLoading] = useState(false), [resultLoading, setResultLoading] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [publicationOpen, setPublicationOpen] = useState(false), [refresh, setRefresh] = useState(0);
  const pending = useRef<Operation | null>(null), writing = useRef(false), alive = useRef(true), sequence = useRef(0);
  const nextPublication = useRef<string | null>(null);
  const cohort = cohorts.find(row => row.id === selected), action = actions.find(row => row.id === actionId);
  const expectedAction = cohort ? cohort.action_link?.action_id : actionId;
  const options = loadedOptions && loadedOptions.action_id === expectedAction && (!cohort?.action_link || loadedOptions.revision === cohort.action_link.revision) ? loadedOptions : null;
  const lock = busy || uncertain, pack = options?.task_pack;
  const availableTargets = analysisTargets(run), taskPlatforms = [...new Set(pack?.ai_targets.map(row => row.platform) || [])];
  const retest = retests.find(row => row.id === retestId && row.cohort_id === selected), result = results.find(row => row.id === resultId && row.cohort_id === selected);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; }; }, []);
  useEffect(() => { onWriteLock?.(lock); return () => onWriteLock?.(false); }, [lock, onWriteLock]);
  useEffect(() => {
    const abort = new AbortController();
    queueMicrotask(() => { if (!abort.signal.aborted) { setLoading(true); setError(''); } });
    Promise.all([observationPages(projectId, 'publicationActions', 'actions', actionSchema, {}, abort.signal), observationPages(projectId, 'cohorts', 'cohorts', cohortSchema, {}, abort.signal)])
      .then(([list, frozen]) => {
        if (abort.signal.aborted) return;
        setActions(list.rows); setCohorts(frozen.rows.filter(row => row.comparison_mode === 'descriptive_v1')); setCanWrite(list.canWrite && frozen.canWrite);
        setActionId(old => old || list.rows.find(row => row.integrity_valid && row.task_pack_available)?.id || '');
      }).catch(err => { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : '行动列表读取失败。'); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [projectId, refresh]);
  const linkedId = cohort ? cohort.action_link?.action_id || '' : actionId;
  const linkedRevision = cohort?.action_link?.revision;
  useEffect(() => {
    const abort = new AbortController();
    queueMicrotask(() => { if (!abort.signal.aborted) { setOptions(null); setAssets([]); setScopeLoading(Boolean(linkedId)); } });
    if (!linkedId || selected && !cohort) return () => abort.abort();
    void (async () => {
      const value = optionsSchema.parse(await observationGet(projectId, 'publicationOptions', { actionId: linkedId, ...(linkedRevision ? { revision: String(linkedRevision) } : {}) }, abort.signal));
      if (value.action_id !== linkedId || linkedRevision && value.revision !== linkedRevision) throw Error('行动版本不匹配，请重新读取。');
      const publications = await observationPages(projectId, 'assets', 'assets', assetSchema, { actionId: value.action_id, revision: String(value.revision) }, abort.signal);
      if (abort.signal.aborted) return;
      setOptions(value); setAssets(publications.rows);
      if (!selected) { setTargets(value.task_pack ? [value.task_pack.own_target_id] : []); setPlatforms([...new Set(value.task_pack?.ai_targets.map(row => row.platform) || [])]); setAssetIds(nextPublication.current && publications.rows.some(row => row.id === nextPublication.current) ? [nextPublication.current] : []); nextPublication.current = null; setTitle(`${value.action_title} · 单次观察`); }
    })().catch(err => { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : '行动版本读取失败。'); }).finally(() => { if (!abort.signal.aborted) setScopeLoading(false); });
    return () => abort.abort();
  }, [projectId, linkedId, linkedRevision, selected, cohort, refresh]);
  const loadResults = useCallback(async (signal?: AbortSignal) => {
    if (!selected) return;
    const generation = ++sequence.current;
    const [tasks, measured] = await Promise.all([observationGet(projectId, 'retests', { cohortId: selected }, signal), observationGet(projectId, 'measurementResults', { cohortId: selected }, signal)]);
    const taskData = z.object({ retests: z.array(retestSchema), truncated: z.boolean().optional() }).parse(tasks);
    const resultData = z.object({ results: z.array(observationResultSchema), truncated: z.boolean().optional() }).parse(measured);
    if (!alive.current || signal?.aborted || generation !== sequence.current) return;
    if (taskData.retests.some(row => row.cohort_id !== selected) || resultData.results.some(row => row.cohort_id !== selected)) throw Error('观察范围不匹配，请重新读取。');
    setRetests(taskData.retests); setResults(resultData.results);
    setRetestId(old => taskData.retests.some(row => row.id === old) ? old : taskData.retests[0]?.id || '');
    setResultId(old => resultData.results.some(row => row.id === old) ? old : resultData.results[0]?.id || '');
    if (taskData.truncated || resultData.truncated) setMessage('当前展示最近50次采集和最近10份观察记录；未汇总未展示记录。');
  }, [projectId, selected]);
  useEffect(() => {
    const abort = new AbortController();
    queueMicrotask(() => { if (!abort.signal.aborted) { setRetests([]); setResults([]); setRetestId(''); setResultId(''); setResultLoading(Boolean(selected)); } });
    if (!selected) return () => abort.abort();
    queueMicrotask(() => { if (!abort.signal.aborted) void loadResults(abort.signal).catch(err => { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : '观察记录读取失败。'); }).finally(() => { if (!abort.signal.aborted) setResultLoading(false); }); });
    const timer = setInterval(() => { if (!writing.current) void loadResults(abort.signal).catch(() => { if (!abort.signal.aborted) setError('进度暂未刷新，保留上次状态；请重新读取。'); }); }, 5000);
    return () => { abort.abort(); clearInterval(timer); sequence.current++; };
  }, [selected, loadResults]);
  const select = (value: string) => {
    if (lock) return; setSelected(value); setError(''); setMessage(''); setAssetIds([]); setRetests([]); setResults([]); setRetestId(''); setResultId('');
    const old = cohorts.find(row => row.id === value); if (old?.action_link) setActionId(old.action_link.action_id);
    setTaskScope(projectId, old?.action_link ? { action: old.action_link.action_id } : {}, { cohortId: value });
  };
  const submit = async (kind: Operation['kind']) => {
    if (writing.current || !canWrite) return;
    if (!pending.current) {
      const base = { projectId, idempotencyKey: crypto.randomUUID() };
      const body = kind === 'create' ? { ...base, action: 'createCohort', comparisonMode: 'descriptive_v1', baselineRunId: run.id, title,
        brandTargetIds: targets, platforms, promptHashes: [], actionId: options?.action_id, expectedActionRevision: options?.revision, publicationAssetIds: assetIds }
        : kind === 'start' ? { ...base, action: 'startRetest', cohortId: selected }
        : kind === 'retry' ? { ...base, action: 'retryRetest', cohortId: selected, retestId: retest?.id, expectedRetryStamp: retest?.retry_stamp }
        : { ...base, action: 'compareCohort', cohortId: selected, followupRunId: retest?.published_run_id };
      pending.current = { body, kind };
    }
    const operation = pending.current;
    writing.current = true; setBusy(true); setError('');
    try {
      const value = await observationPost(operation.body);
      if (operation.kind === 'create') {
        const frozen = cohortSchema.parse(value); setCohorts(old => [frozen, ...old.filter(row => row.id !== frozen.id)]); setSelected(frozen.id);
        setTaskScope(projectId, {}, { cohortId: frozen.id });
        // Advance the durable operation only after the frozen scope receipt is known.
        pending.current = { kind: 'start', body: { projectId, action: 'startRetest', cohortId: frozen.id, idempotencyKey: crypto.randomUUID() } };
        const started = z.object({ id, cohort_id: id, audit_id: z.string() }).parse(await observationPost(pending.current.body));
        if (started.cohort_id !== frozen.id) throw Error('返回观察范围不匹配。');
        setRetestId(started.id); setMessage('复测已受理，正在分平台采集。进度会在本页更新。');
      } else if (operation.kind === 'start') {
        const started = z.object({ id, cohort_id: id, audit_id: z.string() }).parse(value);
        if (started.cohort_id !== selected) throw Error('返回观察范围不匹配。');
        setRetestId(started.id); await loadResults(); setMessage('复测已受理，正在分平台采集。进度会在本页更新。');
      } else { await loadResults(); setMessage(operation.kind === 'retry' ? '仅补齐未完成的回答；保留完整回答，仍是同一次复测。' : '观察结果已保存，可逐品牌、逐平台核对原文。'); }
      pending.current = null; setUncertain(false);
    } catch (err) {
      const known = err instanceof ObservationError && err.status < 500;
      if (known) { pending.current = null; setUncertain(false); if ([403, 409].includes(err.status)) { setOptions(null); setCanWrite(false); } }
      else setUncertain(true);
      setError(known ? err.message : '受理结果尚待确认。范围已固定，请点击“重试同一操作”，不会另建采集请求。');
    } finally { writing.current = false; if (alive.current) setBusy(false); }
  };
  const missingBaseline = !pack || !availableTargets.some(row => row.target_id === pack.own_target_id) || pack.ai_targets.filter(row => platforms.includes(row.platform)).some(row => !run.responses.some(response => response.platform === row.platform && response.prompt_hash === row.prompt_hash));
  const newDraft = () => { if (lock) return; select(''); setTitle(''); setRefresh(value => value + 1); };
  const frozenTargets = cohort?.brand_targets || availableTargets.filter(row => targets.includes(row.target_id));
  return <div className="observation-workspace">
    <div className="citation-section-head"><div><p className="audit-eyebrow">ACTION OBSERVATION</p><h2>行动效果复测</h2><p className="citation-muted">把已交付的内容、实际发布和每个平台的后续回答连起来看。</p></div><button className="dashboard-button dashboard-button--primary" disabled={lock || loading || !canWrite} onClick={newDraft}>新建一次观察</button></div>
    <div className="observation-selectors"><label className="observation-field">关联优化行动<select aria-label="关联优化行动" disabled={lock || loading || !!selected} value={actionId} onChange={event => { setActionId(event.target.value); setTaskScope(projectId, { action: event.target.value }); setError(''); }}><option value="">请选择优化行动</option>{actions.map(row => <option key={row.id} value={row.id}>{row.title} · 修订 {row.revision}{!row.integrity_valid || !row.task_pack_available ? ' · 需核对' : ''}</option>)}</select></label>
      <label className="observation-field">观察记录<select aria-label="观察记录" disabled={lock || loading} value={selected} onChange={event => select(event.target.value)}><option value="">新观察草稿</option>{cohorts.map(row => <option key={row.id} value={row.id}>{row.title} · {chinaTime(row.created_at)}</option>)}</select></label></div>
    {loading && <p role="status">正在读取行动与观察记录…</p>}{selected && !cohort && !loading && <p role="alert">指定观察记录不存在或无权读取；请重新选择，未自动替换成其他观察。</p>}
    {actionId && !action && !loading && <p role="alert">指定行动不存在或无权读取，请重新选择。</p>}
    {error && <p role="alert" className="citation-notice">{error}</p>}{message && <p role="status" className="citation-notice">{message}</p>}
    {uncertain ? <button className="dashboard-button dashboard-button--primary" disabled={busy} onClick={() => submit(pending.current!.kind)}>重试同一操作</button> : <button className="citation-link" disabled={busy} onClick={() => { setRefresh(value => value + 1); void loadResults().catch(err => setError(err instanceof Error ? err.message : '刷新失败。')); }}>刷新观察记录</button>}
    {scopeLoading && <p role="status">正在核对行动修订与交付版本…</p>}
    {options && <>
      <section className="citation-panel"><div className="citation-section-head"><div><p className="citation-muted">关联优化行动 · 修订 {options.revision}</p><h3>{options.action_title}</h3></div><span className="citation-tag">{options.execution_status === 'accepted' ? '交付已验收' : options.deliveries.length ? '已交付，待验收' : '尚无可登记的交付'}</span></div>
        {!options.is_current && <p className="citation-notice">这是历史行动修订；新建观察时使用当前修订，发布登记不会写入历史版本。</p>}
        <div className="observation-publication-head"><div><small className="citation-muted">实际发布登记</small>{(cohort?.action_link?.publications || assets.filter(row => assetIds.includes(row.id))).length === 0 ? <p>尚未关联发布记录</p> : (cohort?.action_link?.publications || assets.filter(row => assetIds.includes(row.id))).map(row => <p key={row.id}>{row.provenance.artifact.title} · {publicationChannels[row.channel] || '登记渠道'} · {chinaTime(row.published_at)}<br /><a className="citation-link" href={/^https?:\/\//i.test(row.url) ? row.url : undefined} target="_blank" rel="noopener noreferrer">查看登记的发布地址 ↗</a></p>)}</div><button className="dashboard-button dashboard-button--secondary" disabled={lock || !options.can_register || !canWrite} onClick={() => setPublicationOpen(true)}>登记已发布资产</button></div>
        <p className="citation-muted">发布登记属于具名人工核对。保存新的登记后会进入新观察草稿，已有观察保持原关联。</p>
      </section>
      <section className="citation-panel"><div className="citation-section-head"><div><p className="audit-eyebrow">FROZEN SCOPE</p><h3>本次观察范围</h3></div><span className="citation-tag">{cohort ? '已冻结' : '待冻结'} · 每题每平台一次</span></div>
        <p className="citation-muted">{cohort ? `基线已固定，${cohort.expected_samples}个问题与平台组合。` : `当前基线：审计 #${run.audit_id} · 修订 ${run.revision}。发起后固定品牌、原问题、平台与评分规则。`}</p>
        <fieldset disabled={lock || !!cohort || !canWrite} className="observation-fields"><div className="observation-scope-grid"><div><h4>目标品牌</h4>{(cohort ? frozenTargets : availableTargets).map(row => <label className="observation-choice" key={row.target_id}><input type="checkbox" checked={cohort ? true : targets.includes(row.target_id)} disabled={row.target_id === pack?.own_target_id || !!cohort || lock} onChange={event => setTargets(old => event.target.checked ? [...old, row.target_id] : old.filter(id => id !== row.target_id))} />{row.name}<span className="citation-tag">{row.role === 'own' ? '自有品牌' : row.role === 'competitor' ? '已登记竞品' : '对比品牌'}{row.identity_status !== 'confirmed' ? ' · 身份待确认' : ''}</span></label>)}</div><div><h4>目标平台</h4>{(cohort?.platforms || taskPlatforms).map(value => <label className="observation-choice" key={value}><input type="checkbox" checked={!!cohort || platforms.includes(value)} onChange={event => setPlatforms(old => event.target.checked ? [...old, value] : old.filter(id => id !== value))} /><AiPlatformLabel platform={value} iconSize={21} /></label>)}</div></div>
          {!cohort && <label className="observation-field">观察名称<input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} /></label>}
          {!cohort && assets.length > 0 && <div><h4>关联已登记的发布（可选）</h4>{assets.map(row => <label className="observation-choice" key={row.id}><input type="checkbox" checked={assetIds.includes(row.id)} onChange={event => setAssetIds(old => event.target.checked ? [...old, row.id] : old.filter(id => id !== row.id))} />{row.provenance.artifact.title} · {chinaTime(row.published_at)}</label>)}</div>}
        </fieldset>
        <div className="observation-question"><small className="citation-muted">原任务问题</small>{[...new Map((cohort?.questions || pack?.delivery.questions || []).map(q => [q.prompt_hash, q])).values()].map((q, i) => <p key={i}>{'text' in q ? q.text || '原文待读取' : ''}</p>)}<details><summary>查看原任务的观察目标</summary><p>品牌出现、推荐强度、推荐位置、具体选择理由，以及实际引用卡片、已保存来源正文与检索候选。各项分别记录，不生成改善总分。</p></details></div>
        {!cohort && missingBaseline && <p className="citation-notice">当前基线缺少原任务的自有品牌或目标问题，请先选择包含这些问题的基线审计。</p>}
        <div className="observation-capture-band"><div><strong>{!cohort ? '准备一次复测' : resultLoading ? '正在读取采集与分析状态' : retest ? retest.pending_samples ? '正在分平台采集' : retest.analysis_pending ? '回答已返回，正在分析' : retest.published_run_id ? '本次分析已完成' : '采集或分析尚未完成' : '固定范围已就绪'}</strong><p className="citation-muted">{retest ? `完整回答 ${retest.complete_samples}/${retest.expected_samples} · 等待 ${retest.pending_samples} · 失败或不完整 ${retest.missing_samples}` : '每个原问题在每个平台采集一次，进度在本页更新。'}</p></div>
          {!cohort ? <button className="dashboard-button dashboard-button--primary" disabled={lock || !canWrite || missingBaseline || !options.is_current || !action?.integrity_valid || !platforms.length || title.trim().length < 5} onClick={() => submit('create')}>开始一次复测</button>
            : !retests.length && !resultLoading ? <button className="dashboard-button dashboard-button--primary" disabled={lock || !canWrite} onClick={() => submit('start')}>开始一次复测</button> : null}
        </div>
        {!!retests.length && <label className="observation-field">本方案采集记录<select value={retestId} disabled={lock} onChange={event => setRetestId(event.target.value)}>{retests.map((row, i) => <option key={row.id} value={row.id}>采集记录 {retests.length - i} · 审计 #{row.audit_id}</option>)}</select></label>}
        {retest && <><div className="observation-progress" role="status">{retest.platforms.map(row => <span key={row.platform}><AiPlatformLabel platform={row.platform} iconSize={18} /> · 完整 {row.complete}/{row.expected}{row.pending ? ` · 等待 ${row.pending}` : ''}{row.missing ? ` · 缺失 ${row.missing}` : ''}</span>)}</div>
          {!retest.sample_scope_valid && <p role="alert">采集样本与固定范围不符，已禁止补齐，请核对采集记录。</p>}
          {!!retest.missing_samples && <p className="citation-notice">未取得完整回答的项目保持缺失，不补零；已完成的平台结果仍可查阅。</p>}
          {retest.can_retry && <button className="dashboard-button dashboard-button--secondary" disabled={lock || !canWrite} onClick={() => submit('retry')}>补齐未完成项</button>}
          {retest.retry_limit_reached && <p className="citation-muted">本次补齐次数已达上限，保留已取得的数据，请检查采集服务。</p>}
          {retest.published_run_id && <button className="dashboard-button dashboard-button--primary" disabled={lock || !canWrite} onClick={() => submit('compare')}>整理本次观察</button>}
        </>}
      </section>
    </>}
    {!!results.length && <label className="observation-field">已保存的观察结果<select aria-label="已保存的观察结果" value={resultId} disabled={lock} onChange={event => setResultId(event.target.value)}>{results.map(row => <option key={row.id} value={row.id}>{chinaTime(row.created_at)}{row.snapshot_current ? ' · 当前有效' : ' · 历史记录'}</option>)}</select></label>}
    {result && <ObservationResults key={result.id} result={result} cohort={cohort} onOpen={onOpenEvidence} />}
    {publicationOpen && options && <PublicationDrawer projectId={projectId} options={options} onClose={() => { setPublicationOpen(false); setRefresh(value => value + 1); }} onSaved={row => { nextPublication.current = row.id; setPublicationOpen(false); select(''); setAssets(old => [row, ...old]); setAssetIds([row.id]); setRefresh(value => value + 1); setMessage('发布登记已保存，已进入新的观察草稿。请核对范围后冻结。'); }} />}
  </div>;
}
