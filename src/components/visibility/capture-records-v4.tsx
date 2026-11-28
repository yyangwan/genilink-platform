'use client';

import { useRef, useState } from 'react';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import { getAiPlatformMeta } from '@/lib/ai-platforms';
import { CAPTURE_PLATFORMS } from '@/lib/visibility/capture-policy';
import {
  auditApi, type CaptureSampleDetail, type CaptureSamplePage, type CaptureSource, type CaptureSourceOriginal,
} from '@/lib/visibility/v4-audit';
import { CaptureAnswer } from './capture-answer';
import { ArchivedOriginal, SafeSourceLink } from './capture-source-original';
import { useAuditResource } from './use-audit-v4';

const sampleStates: Record<string, string> = { received: '已入库', pending: '待采集', failed: '采集失败' };
const attemptReasons: Record<string, string> = {
  capture_timeout: '平台回答超时', capture_waiting: '等待可用采集资源', capture_cancelled: '采集已取消',
  capture_error: '平台回答未能入库',
};
const archiveReasons: Record<string, string> = {
  link_unresolved: '尚未取得可核验的原文链接', link_unsupported: '原文链接不支持归档',
  source_blocked: '来源限制访问', source_unavailable: '未取得可读取的正文',
};
const archiveLabels: Record<string, string> = {
  archived: '正文已归档', pending: '正文归档中', not_started: '等待归档', unavailable: '未取得正文',
};
const attemptStates: Record<string, string> = {
  accepted: '已入库', completed: '已入库', pending: '等待采集', leased: '采集中', failed: '采集失败', cancelled: '已取消',
};
const dateTime = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai',
});

function ArchivedText({ projectId, auditId, sampleId, source, requestedSnapshot }: {
  projectId: string; auditId: string; sampleId: string; source: CaptureSource; requestedSnapshot?: string;
}) {
  const snapshotId = requestedSnapshot || source.archive.snapshot_id;
  const [open, setOpen] = useState(!!requestedSnapshot);
  const text = useAuditResource<CaptureSourceOriginal>(
    open && snapshotId ? auditApi('captureSource', projectId, auditId, {
      sampleId, ordinal: String(source.ordinal), snapshotId,
    }) : null,
  );
  if (!snapshotId) return null;
  return <div className="v4-source-reader">
    <button type="button" className="v4-link" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {source.archive.has_media ? (open ? '收起引用原文' : '查看引用原文') : (open ? '收起归档正文' : '展开归档正文')}
    </button>
    {open && (text.loading ? <p role="status">正在读取正文…</p> : text.error ? <p role="alert">{text.error} <button className="v4-link" type="button" onClick={text.refetch}>重新查询正文</button></p>
      : text.data && <ArchivedOriginal data={text.data} previewOptions={{
        projectId, auditId, sampleId, ordinal: String(source.ordinal), snapshotId,
      }} />)}
  </div>;
}

export function CaptureRecordDrawer({ projectId, auditId, sampleId, requestedSource, version, canReadSource = true, onClose }: {
  projectId: string; auditId: string; sampleId: string; version: unknown;
  canReadSource?: boolean;
  requestedSource?: { ordinal: number; snapshot_id: string }; onClose: () => void;
}) {
  const record = useAuditResource<CaptureSampleDetail>(auditApi('captureSample', projectId, auditId, { sampleId }), version);
  const data = record.data;
  const sourceSection = useRef<HTMLElement>(null);
  function focusSource(ordinal: number) {
    const source = sourceSection.current?.querySelector<HTMLElement>(`[data-source-ordinal="${ordinal}"]`);
    source?.focus({ preventScroll: true });
    source?.scrollIntoView({ block: 'start' });
  }
  return <ReadingDrawer title="采集详情" closeLabel="关闭采集详情" onClose={onClose}>
    <div className="audit-v4 v4-reader v4-capture-record">
      {record.loading && <p role="status">正在读取采集详情…</p>}
      {record.error && <p role="alert">{record.error} <button className="v4-link" type="button" onClick={record.refetch}>重新查询</button></p>}
      {data && <>
        <div className="v4-row"><AiPlatformLabel platform={data.platform} /><span className="v4-chip" data-tone={data.status === 'received' ? 'ok' : 'warn'}>{sampleStates[data.status]}</span></div>
        <section aria-labelledby="capture-record-question"><h3 id="capture-record-question">原始问题</h3><p className="v4-pre v4-capture-question">{data.prompt.text}</p></section>
        <section aria-labelledby="capture-record-answer"><h3 id="capture-record-answer">原始回答</h3>
          {data.answer ? <>{data.answer.status === 'partial' && <p className="v4-note v4-warn">已保存部分回答</p>}
            <CaptureAnswer text={data.answer.text} references={data.answer.references} ordinals={new Set(data.sources.map(source => source.ordinal))} onReference={focusSource} /></>
            : <p className="v4-note">{data.status === 'failed' ? '该样本未取得回答，原因见采集尝试。' : '等待平台回答入库。'}</p>}
        </section>
        <section ref={sourceSection} className="v4-capture-sources" aria-labelledby="capture-record-sources"><h3 id="capture-record-sources">引用和归档正文</h3>
          {data.source_panel && <p className="v4-note">取得 {data.source_panel.capturedCount}{data.source_panel.expectedCount !== null ? ` / ${data.source_panel.expectedCount}` : ''} 条引用。</p>}
          {!data.sources.length && <p className="v4-note">该样本暂无引用记录。</p>}
          {data.sources.map(source => <article key={source.ordinal} className="v4-subpanel" data-source-ordinal={source.ordinal} tabIndex={-1}>
            <div className="v4-row"><strong>{source.title ? <><span aria-hidden="true">{source.ordinal}. </span><span>{source.title}</span></> : `引用 ${source.ordinal}`}</strong>
              <span className="v4-chip" data-tone={source.archive.status === 'archived' ? 'ok' : 'warn'}>{archiveLabels[source.archive.status] || '归档状态待确认'}</span></div>
            <SafeSourceLink url={source.url} />
            {source.snippet && <p className="v4-note v4-pre">{source.snippet}</p>}
            {source.archive.reason && <p className="v4-note">{archiveReasons[source.archive.reason] || '未取得正文'}</p>}
            {source.archive.archived_at && <p className="v4-note">{dateTime.format(new Date(source.archive.archived_at))}（北京时间）归档</p>}
            {source.archive.used_in_analysis === false && <p className="v4-note">该归档版本未纳入本次分析。</p>}
            {canReadSource && <ArchivedText projectId={projectId} auditId={auditId} sampleId={sampleId} source={source}
              requestedSnapshot={requestedSource?.ordinal === source.ordinal ? requestedSource.snapshot_id : undefined} />}
          </article>)}
        </section>
        {data.attempts.length > 0 && <section><h3>采集尝试</h3>
          <ul className="v4-attempts">{data.attempts.map(attempt => <li key={attempt.number}>
            <strong>第 {attempt.number} 次 · {attemptStates[attempt.status] || '状态待确认'}</strong>
            {attempt.reason && <span> · {attemptReasons[attempt.reason] || '未取得回答'}</span>}
            {(attempt.started_at || attempt.ended_at) && <span> · {dateTime.format(new Date((attempt.ended_at || attempt.started_at)!))}（北京时间）</span>}
          </li>)}</ul>
        </section>}
      </>}
    </div>
  </ReadingDrawer>;
}

function SampleTable({ projectId, auditId, platform, status, version, onRecord }: {
  projectId: string; auditId: string; platform: string; status: string; version: unknown; onRecord: (id: string) => void;
}) {
  const [history, setHistory] = useState<string[]>([]);
  const cursor = history.at(-1) || '';
  const params = { ...(platform ? { platform } : {}), ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) };
  const { data, loading, error, refetch } = useAuditResource<CaptureSamplePage>(auditApi('captureSamples', projectId, auditId, params), version);
  const rows = Array.isArray(data?.items) ? data.items : [];
  return <>
    {error && <p role="alert" className="v4-warn">{error} <button className="v4-link" type="button" onClick={refetch}>重新查询</button></p>}
    <div className="v4-table-wrap"><table className="citation-table">
      <thead><tr><th scope="col">平台</th><th scope="col">原始问题</th><th scope="col">状态</th><th scope="col">归档正文 / 引用</th><th scope="col">记录</th></tr></thead>
      <tbody>{rows.map(sample => <tr key={sample.id}>
        <td><AiPlatformLabel platform={sample.platform} /></td><td>{sample.prompt_excerpt}</td>
        <td><span className="v4-chip" data-tone={sample.status === 'received' ? 'ok' : 'warn'}>
          {sampleStates[sample.status]}{sample.answer_status === 'partial' && ' · 部分回答'}</span></td>
        <td>{sample.status === 'received' ? `${sample.archived_count} / ${sample.source_count}` : '—'}</td>
        <td><button type="button" className="v4-link" onClick={() => onRecord(sample.id)}>查看记录</button></td>
      </tr>)}</tbody>
    </table></div>
    {loading && !data && <p role="status">正在读取原始采集记录…</p>}
    {!loading && !error && !rows.length && <p className="v4-note">所选范围暂无采集记录。</p>}
    {(history.length > 0 || data?.next_cursor) && <div className="v4-controls">
      <button type="button" className="dashboard-button dashboard-button--secondary" disabled={!history.length || loading} onClick={() => setHistory(previous => previous.slice(0, -1))}>上一页</button>
      <button type="button" className="dashboard-button dashboard-button--secondary" disabled={!data?.next_cursor || loading} onClick={() => {
        if (data?.next_cursor) setHistory(previous => [...previous, data.next_cursor!]);
      }}>下一页</button>
    </div>}
  </>;
}

export function CaptureRecords({ projectId, auditId, version, selectedRecord, requestedSource, canReadSource, onRecord }: {
  projectId: string; auditId: string; version: unknown; selectedRecord: string | null;
  canReadSource?: boolean;
  requestedSource?: { ordinal: number; snapshot_id: string }; onRecord: (sampleId: string | null) => void;
}) {
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  return <section className="citation-panel v4-panel" aria-label="原始采集记录">
    <div className="v4-row"><div><h2>原始采集记录</h2><p className="v4-note">查看实际入库的回答、引用和归档正文。</p></div>
      <div className="v4-filters">
        <label>平台<select aria-label="筛选采集平台" value={platform} onChange={event => setPlatform(event.target.value)}>
          <option value="">全部平台</option>
          {CAPTURE_PLATFORMS.map(key => <option key={key} value={key}>{getAiPlatformMeta(key).label}</option>)}
        </select></label>
        <label>状态<select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">全部状态</option>
          {Object.entries(sampleStates).map(([key, name]) => <option value={key} key={key}>{name}</option>)}
        </select></label>
      </div>
    </div>
    <SampleTable key={platform + ':' + status} projectId={projectId} auditId={auditId} platform={platform} status={status}
      version={version} onRecord={onRecord} />
    {selectedRecord && <CaptureRecordDrawer key={selectedRecord} projectId={projectId} auditId={auditId} sampleId={selectedRecord}
      requestedSource={requestedSource} version={version} canReadSource={canReadSource} onClose={() => onRecord(null)} />}
  </section>;
}
