// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VisibilityResults } from '@/components/visibility/visibility-results';
import type { CitationDashboard } from '@/types/citation-dashboard';

afterEach(cleanup);
const data: CitationDashboard = { schema: 'citation-dashboard-1', project_id: 'p1', enabled: true, processing: false,
  latest_audit: { id: '12', status: 'completed', stage: 'completed', created_at: '2026-10-19', platforms: ['qwen'] },
  report: { schema: 'citation-report-1', project_id: 'p1', audit_id: '12', run_id: 'run1', status: 'partial', snapshot_current: true, revision: 2,
    coverage: { responses: 2, sources: 2, captured_sources: 1, analyzed_characters: 80, total_characters: 100 },
    entities: [{ id: 'own', name: '自有品牌', kind: 'brand', role: 'own', identity_status: 'confirmed', response_count: 1, source_mentions: 0, platform_response_counts: {} },
      { id: 'unknown', name: '未登记主体', kind: 'brand', role: 'unregistered', identity_status: 'provisional', response_count: 1, source_mentions: 0, platform_response_counts: {} }],
    platforms: [{ platform: 'qwen', samples: 2, metrics: [{ metric: 'answer_presence', included: ['r1', 'r2'], excluded: [], entities: [{ entity_id: 'own', numerator: 1, denominator: 2 }] }] }],
    sources: [{ id: 's1', response_id: 'r1', platform: 'qwen', title: '测试文章', kind: 'answer_reference', snippet: '文章摘要', snapshot_id: null, fetch_status: 'blocked' }],
    diagnoses: [{ id: 'd1', platform: 'qwen', prompt: '有哪些方案', finding: '回答仍需核验', sample_count: 2,
      action: { status: 'proposed', task: '核对引用文章', materials_needed: [], success_check: '确认原文' } }] } };

describe('visibility results for the selected audit', () => {
  it('does not show a previous audit as current or enable its result tabs', () => {
    render(<VisibilityResults data={data} projectId="p1" auditId="13" />);
    expect(screen.getByText(/不使用历史审计填充/)).toBeTruthy();
    expect(screen.getByRole('tab', { name: '来源与证据' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByText('回答仍需核验')).toBeNull();
  });
  it('keeps captured sources accessible when semantic analysis parsed no text', () => {
    const emptyAnalysis: CitationDashboard = { ...data, report: { ...data.report!, coverage: { ...data.report!.coverage!, analyzed_characters: 0, total_characters: 384229 }, diagnoses: [], entities: [] } };
    render(<VisibilityResults data={emptyAnalysis} projectId="p1" auditId="12" />);
    expect(screen.getByText(/当前不能据此判断品牌表现/)).toBeTruthy();
    expect(screen.getByText(/暂无可用的文本分析结论/)).toBeTruthy();
    expect(screen.getByText('先处理数据缺口')).toBeTruthy();
    expect(screen.queryByText('回答仍需核验')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '优化行动' }));
    expect(screen.getByText('先修复分析数据')).toBeTruthy();
    expect(screen.queryByRole('link', { name: '进入行动计划与审批 →' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /来源与证据/ }));
    expect(screen.getByText('测试文章')).toBeTruthy();
  });
  it('shows real counts, independent denominators, source gaps and review actions', () => {
    render(<VisibilityResults data={data} projectId="p1" auditId="12" />);
    expect(screen.getAllByText('回答仍需核验').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: /分平台比较/ }));
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('暂无有效分母')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /来源与证据/ }));
    expect(screen.getByText('测试文章')).toBeTruthy();
    expect(screen.getByText(/1 条来源正文未保存/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /优化行动/ }));
    expect(screen.getByText('核对引用文章')).toBeTruthy();
    expect(screen.getByRole('link', { name: '查看依据 ↗' }).getAttribute('href')).toContain('runId=run1');
  });
  it('does not keep another platform finding after the platform filter changes', () => {
    const filtered: CitationDashboard = { ...data, report: { ...data.report!, diagnoses: [...data.report!.diagnoses!,
      { id: 'd2', platform: 'doubao', finding: '豆包需要核对来源', sample_count: 1 }] },
      latest_audit: { ...data.latest_audit!, platforms: ['qwen', 'doubao'] } };
    render(<VisibilityResults data={filtered} projectId="p1" auditId="12" />);
    fireEvent.change(screen.getByRole('combobox', { name: '筛选分析平台' }), { target: { value: 'doubao' } });
    expect(screen.getByRole('heading', { name: '豆包需要核对来源' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '回答仍需核验' })).toBeNull();
  });
});
