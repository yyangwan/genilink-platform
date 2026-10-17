// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/components/dashboard/use-section-fetch', () => ({ useSectionFetch: vi.fn(() => ({ data: { items: [{ id: 'segment', text: '<script>saved plain text</script>' }], next_offset: null }, loading: false, error: false, locked: false })) }));
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { CitationReportView } from '@/components/visibility/citation-report';
import type { CitationReport } from '@/types/citation-report';
afterEach(cleanup);
const report: CitationReport = { schema: 'citation-report-1', audit_id: '12', project_id: 'p1', run_id: 'a'.repeat(32), status: 'stale', snapshot_current: false,
  entities: [{ id: 'other', name: '未登记品牌', role: 'unregistered', kind: 'brand', identity_status: 'provisional', response_count: 1, source_mentions: 0, platform_response_counts: {} }],
  platforms: [{ platform: 'qwen', samples: 2, metrics: [{ metric: 'cited_archive_presence', included: [], excluded: [{ response_id: 'r1', reason: 'cited_archive_incomplete' }], entities: [{ entity_id: 'other', numerator: 0, denominator: 0 }] }] }, { platform: 'deepseek', samples: 1, metrics: [] }],
  sources: [{ id: 'b'.repeat(32), response_id: '1', platform: 'qwen', title: '候选材料', snippet: '', kind: 'search_candidate', snapshot_id: 'c'.repeat(32), fetch_status: 'captured' }] };
describe('evidence report', () => {
  it('keeps unknown independent denominators and nonregistered entities explicit', () => {
    render(<CitationReportView report={report} projectId="p1" />);
    expect(screen.getByText('未登记品牌')).toBeTruthy(); expect(screen.getByText('未知（无有效样本）')).toBeTruthy();
    expect(screen.getByText(/当前快照尚不能作为最新建议/)).toBeTruthy(); expect(screen.getByText(/来源正文缺失|引用正文缺失/)).toBeTruthy();
    expect(screen.getByText(/检索候选 · 保存正文/)).toBeTruthy();
  });
  it('filters platforms without mixing their source lists', () => {
    render(<CitationReportView report={report} projectId="p1" />);
    fireEvent.change(screen.getByLabelText('报告平台'), { target: { value: 'deepseek' } });
    expect(screen.queryByText('候选材料')).toBeNull(); expect(screen.queryByText('未登记品牌')).toBeNull();
  });
  it('opens saved content using the exact project/run/snapshot and renders plain text', () => {
    render(<CitationReportView report={report} projectId="p1" />);
    fireEvent.click(screen.getByText('查看保存正文'));
    expect(vi.mocked(useSectionFetch).mock.calls.at(-1)?.[0]).toContain(`runId=${'a'.repeat(32)}`);
    expect(vi.mocked(useSectionFetch).mock.calls.at(-1)?.[0]).toContain(`ownerId=${'c'.repeat(32)}`);
    expect(screen.getByText('<script>saved plain text</script>')).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
  });
  it('opens paired evidence in its own baseline run and suppresses stale report deltas', () => {
    const metric = { entity_id: 'other', metric: 'cited_card_presence', baseline: { numerator: 1, denominator: 10 }, followup: { numerator: 3, denominator: 10 }, difference: 0.2, interval95: [0.1, 0.3] as [number, number], descriptive: { baseline: { numerator: 1, denominator: 10 }, followup: { numerator: 3, denominator: 10 } }, traces: { baseline: { r1: [{ citation_id: 'card', owner_kind: 'citation', owner_id: 'c'.repeat(32), article_completeness: null, mention_id: 'mention' }] } } };
    const data: CitationReport = { ...report, status: 'ready', snapshot_current: true, measurements: { scope_run_id: report.run_id!, truncated: false, results: [{ id: 'm1', cohort_id: 'cohort', version: 'paired-source-presence-2', created_at: '2026-10-16', snapshot_current: true, baseline_run_id: 'b'.repeat(32), followup_run_id: report.run_id!, baseline_audit_id: '11', followup_audit_id: '12', report_role: 'followup', entities: [{ id: 'other', name: '复测主体', identity_status: 'confirmed' }], platforms: [{ platform: 'qwen', status: 'valid_comparison', expected_samples: 60, prompt_clusters: 20, included: [], excluded: [], out_of_cohort: [], metrics: [metric] }] }] } };
    const { rerender } = render(<CitationReportView report={data} projectId="p1" />);
    expect(screen.getByText(/20.0个百分点/)).toBeTruthy();
    fireEvent.click(screen.getByText('查看口径与证据')); fireEvent.click(screen.getByText('查看保存内容'));
    expect(vi.mocked(useSectionFetch).mock.calls.at(-1)?.[0]).toContain(`runId=${'b'.repeat(32)}`);
    rerender(<CitationReportView report={{ ...data, snapshot_current: false }} projectId="p1" />);
    expect(screen.queryByText(/20.0个百分点/)).toBeNull(); expect(screen.getByText('不输出变化结论')).toBeTruthy();
  });
});
