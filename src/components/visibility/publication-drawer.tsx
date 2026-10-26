"use client";
import { useRef, useState } from 'react';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import { assetSchema, beijingTimestamp, chinaTime, ObservationError, observationPost, type Publication, type PublicationOptions } from '@/lib/visibility/observation-contract';
import { publicationRequestSchema } from '@/lib/visibility/measurement-request';

export const publicationChannels: Record<string, string> = { website: '官网', zhihu: '知乎', wechat: '微信公众号', weibo: '微博', xiaohongshu: '小红书', douyin: '抖音', toutiao: '今日头条' };
export function PublicationDrawer({ projectId, options, onClose, onSaved }: { projectId: string; options: PublicationOptions; onClose: () => void; onSaved: (row: Publication) => void }) {
  const [version, setVersion] = useState(''), [url, setUrl] = useState(''), [channel, setChannel] = useState('website'), [time, setTime] = useState(''), [reason, setReason] = useState(''), [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false), [error, setError] = useState('');
  const pending = useRef<Record<string, unknown> | null>(null), writing = useRef(false);
  const lock = busy || uncertain;
  const selected = options.deliveries.find(item => `${item.delivery_event_id}:${item.artifact_index}` === version);
  const valid = selected && url && channel && time && reason.trim().length >= 5 && checked && options.can_register;
  const save = async () => {
    if (writing.current || conflict) return;
    if (!pending.current) {
      if (!selected) return;
      let publishedAt: string; try { publishedAt = beijingTimestamp(time); } catch { setError('请填写有效的北京时间。'); return; }
      const value = publicationRequestSchema.safeParse({ actionId: options.action_id, expectedRevision: options.revision,
        deliveryEventId: selected.delivery_event_id, artifactIndex: selected.artifact_index, versionConfirmed: checked,
        url, channel, publishedAt, reason, idempotencyKey: crypto.randomUUID() });
      if (!value.success) { setError('请核对发布地址、版本、实际发布时间和登记依据，发布时间不能晚于当前时间。'); return; }
      pending.current = { projectId, action: 'recordAsset', ...value.data };
    }
    writing.current = true; setBusy(true); setError('');
    try {
      const row = assetSchema.parse(await observationPost(pending.current)); pending.current = null; setUncertain(false); onSaved(row);
    } catch (err) {
      const known = err instanceof ObservationError && err.status < 500;
      if (known) { pending.current = null; setUncertain(false); if ([403, 409].includes(err.status)) setConflict(true); }
      else setUncertain(true);
      setError(known ? err.message : '发布登记受理尚待确认。表单已固定，请沿用相同登记重试。');
    } finally { writing.current = false; setBusy(false); }
  };
  return <ReadingDrawer title="登记实际发布" eyebrow="PUBLICATION RECORD" closeLabel="关闭发布登记" onClose={() => { if (!lock) onClose(); }}>
    <div className="observation-workspace"><p className="citation-notice">记录已经发生的发布，关联本行动的具体交付版本。这里不会代为发布内容。</p>
      <p>{options.action_title} · 修订 {options.revision}</p>
      <fieldset disabled={lock || conflict} className="observation-fields">
        <label className="observation-field">已交付版本<select value={version} onChange={event => setVersion(event.target.value)}><option value="">请选择已交付版本</option>{options.deliveries.map(item => <option key={`${item.delivery_event_id}:${item.artifact_index}`} value={`${item.delivery_event_id}:${item.artifact_index}`}>{item.title} · {item.acceptance_state === 'accepted' ? '已验收' : '已交付，待验收'}</option>)}</select></label>
        {selected && <small className="citation-muted">交付登记时间：{chinaTime(selected.submitted_at)}。此时间不等同于实际发布时间。</small>}
        <label className="observation-field">发布地址<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://..." maxLength={4096} /></label>
        <label className="observation-field">发布渠道<select value={channel} onChange={event => setChannel(event.target.value)}>{Object.entries(publicationChannels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label className="observation-field">实际发布时间（北京时间）<input type="datetime-local" value={time} onChange={event => setTime(event.target.value)} /></label>
        <label className="observation-field">登记依据<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="说明已发布的内容版本及核对依据（至少5字）" maxLength={2000} /></label>
        <label className="observation-choice"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />我已核对发布地址、内容版本和发布时间。</label>
      </fieldset>
      <p className="citation-muted">这是一条具名人工登记；系统没有核验发布页面全文与交付文件逐字一致。验收、发布和效果分别记录。</p>
      {error && <p role="alert" className="citation-notice">{error}</p>}
      {conflict ? <button className="dashboard-button dashboard-button--secondary" onClick={onClose}>关闭并刷新可用版本</button> : <button className="dashboard-button dashboard-button--primary" disabled={busy || !uncertain && !valid} onClick={save}>{busy ? '正在保存…' : uncertain ? '重试同一发布登记' : '保存发布登记'}</button>}
    </div>
  </ReadingDrawer>;
}
