"use client";
import { useState } from 'react';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';

export function SavedContent({ projectId, runId, kind, id, close }: { projectId: string; runId: string; kind: string; id: string; close: () => void }) {
  const [offset, setOffset] = useState(0);
  const content = useSectionFetch<{ items: Array<{ id: string; text: string }>; next_offset: number | null }>(`/api/integration/intelligence?${new URLSearchParams({ projectId, view: 'content', runId, ownerKind: kind, ownerId: id, offset: String(offset) })}`);
  return <ReadingDrawer title="保存的原文" onClose={close}>{content.loading ? <p>加载中…</p> : content.error || content.locked ? <p>原文暂不可读或当前订阅无访问权限，请重试。</p> : <>{content.data?.items.map(item => <p className="my-3 whitespace-pre-wrap break-words" key={item.id}>{item.text}</p>)}<div className="flex gap-4"><button className="dashboard-button dashboard-button--secondary" disabled={offset === 0} onClick={() => setOffset(0)}>回到开头</button>{content.data?.next_offset != null && <button className="dashboard-button dashboard-button--secondary" onClick={() => setOffset(content.data!.next_offset!)}>下一页</button>}</div></>}</ReadingDrawer>;
}
