// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VisibilityOverview } from '@/components/visibility/visibility-overview';
import type { CitationDashboard } from '@/types/citation-dashboard';
afterEach(cleanup);
const data: CitationDashboard = { schema: 'citation-dashboard-1', project_id: 'p1', enabled: true, processing: false,
  latest_audit: { id: '12', status: 'completed', stage: 'completed', created_at: '2026-10-15', platforms: ['qwen', 'deepseek'] },
  report: { schema: 'citation-report-1', project_id: 'p1', audit_id: '12', status: 'partial', snapshot_current: true, revision: 2,
    entities: [{ id: 'e1', name: '未登记品牌', role: 'unregistered', kind: 'brand', identity_status: 'provisional', response_count: 1, source_mentions: 0, platform_response_counts: {} }],
    platforms: [{ platform: 'qwen', samples: 2, metrics: [{ metric: 'answer_presence', included: ['r1', 'r2'], excluded: [], entities: [{ entity_id: 'e1', numerator: 1, denominator: 2 }] }, { metric: 'cited_archive_presence', included: [], excluded: [{ response_id: 'r1', reason: 'cited_archive_incomplete' }], entities: [{ entity_id: 'e1', numerator: 0, denominator: 0 }] }] }] } };
describe('single-snapshot visibility overview', () => {
  it('distinguishes scheduled work while keeping dashboard polling active', () => {
    render(<VisibilityOverview data={{ ...data, processing: true, waiting: true }} projectId="p1" />);
    expect(screen.getByText(/后续任务已排期，当前处于等待/)).toBeTruthy();
    expect(screen.queryByText(/采集或分析正在进行/)).toBeNull();
  });
  it('keeps all entities and independent denominators without invented scores or missing-platform zeros', () => {
    render(<VisibilityOverview data={data} projectId="p1" />);
    expect(screen.getByText('未登记品牌')).toBeTruthy(); expect(screen.getByText('1/2（50.0%）')).toBeTruthy();
    expect(screen.getByText(/回答样本未知或尚未取得/)).toBeTruthy();
    expect(screen.getAllByText('未知（无有效样本）').length).toBeGreaterThan(0);
    expect(screen.queryByText('AI可见性得分')).toBeNull();
    expect(screen.getByText('查看本次审计洞察与来源证据').closest('a')?.getAttribute('href')).toBe('/intelligence?project=p1&auditId=12&view=overview');
  });
  it('labels processing and stale snapshots rather than presenting old conclusions as current', () => {
    render(<VisibilityOverview data={{ ...data, processing: true, context_sync_pending: true, report: { ...data.report!, status: 'stale', snapshot_current: false } }} projectId="p1" />);
    expect(screen.getByText(/尚不是完整结果/)).toBeTruthy(); expect(screen.getByText(/不作为最新优化结论/)).toBeTruthy();
  });
  it('shows empty and disabled states with no synthetic zero metrics', () => {
    const { rerender } = render(<VisibilityOverview data={{ ...data, latest_audit: null, report: null }} projectId="p1" />);
    expect(screen.getByText(/尚未创建审计/)).toBeTruthy(); expect(screen.queryByText('已保存来源正文')).toBeNull();
    rerender(<VisibilityOverview data={{ ...data, enabled: false }} projectId="p1" />);
    expect(screen.getByText('证据分析尚未启用')).toBeTruthy(); expect(screen.queryByText('未登记品牌')).toBeNull();
  });
});
