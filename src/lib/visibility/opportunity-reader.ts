import type { OpportunityPage } from './task-contract';
import { apiError } from './task-view';

export type OpportunityCollection = OpportunityPage & { can_write: boolean };
export async function loadOpportunities(projectId: string, runId: string, priority: 'frozen' | 'current', signal: AbortSignal): Promise<OpportunityCollection> {
  let offset: number | null = 0, first: OpportunityCollection | null = null;
  const items: OpportunityPage['items'] = [], ids = new Set<string>();
  while (offset !== null) {
    const params = new URLSearchParams({ projectId, runId, op: 'opportunities', priority, offset: String(offset), limit: '100' });
    const response = await fetch('/api/integration/intelligence/tasks?' + params, { signal, cache: 'no-store' });
    const raw = await response.json();
    if (!response.ok) throw Error(apiError(raw, '机会读取失败，请重试。'));
    const page = raw as OpportunityCollection;
    if (!page || !Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0 ||
      page.items.length > 100 || (page.next_offset !== null && (!Number.isSafeInteger(page.next_offset) || page.next_offset <= offset || page.next_offset !== offset + page.items.length || page.next_offset >= page.total))) throw Error('机会分页格式无效，请重新读取。');
    if (!first) first = page;
    if (page.version !== first.version || page.total !== first.total || page.status !== first.status || page.ranking_scope !== first.ranking_scope || page.ranking_scope !== priority ||
      JSON.stringify(page.policy) !== JSON.stringify(first.policy) || page.can_write !== first.can_write) throw Error('排序或机会版本已变化，请重新读取。');
    for (const row of page.items) { if (!row?.id || ids.has(row.id)) throw Error('机会记录重复或无效，请重新读取。'); ids.add(row.id); items.push(row); }
    if (items.length > first.total) throw Error('机会数量不一致，请重新读取。');
    offset = page.next_offset;
  }
  if (!first || items.length !== first.total) throw Error('机会尚未完整读取，请重试。');
  return { ...first, items, can_write: first.can_write === true };
}
