// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EntityComparison } from '@/components/visibility/entity-comparison';
import { StrategicEvidence } from '@/components/visibility/strategic-evidence';
import type { CitationReport } from '@/types/citation-report';

afterEach(cleanup);
const report = { schema: 'citation-report-1', project_id: 'p1', audit_id: '12', snapshot_current: true, status: 'ready', entities: [{ id: 'e1', name: '同名主体', role: 'own', identity_status: 'confirmed' }, { id: 'e2', name: '同名主体', role: 'unregistered', identity_status: 'provisional' }], platforms: [{ platform: 'qwen', samples: 4, metrics: [{ metric: 'answer_presence', included: ['r1', 'r2', 'r3', 'r4'], excluded: [], entities: [{ entity_id: 'e1', numerator: 1, denominator: 4 }, { entity_id: 'e2', numerator: 3, denominator: 4 }] }, { metric: 'cited_archive_presence', included: [], excluded: [{ response_id: 'r1', reason: 'cited_archive_incomplete' }], entities: [{ entity_id: 'e1', numerator: 0, denominator: 0 }] }] }, { platform: 'deepseek', samples: 1, metrics: [] }] } as unknown as CitationReport;
describe('all-entity evidence comparison', () => {
  it('keeps stable identities despite duplicate names and computes only same-population descriptive gaps', () => {
    const select = vi.fn(); render(<EntityComparison report={report} platform="qwen" onEntity={select} />);
    fireEvent.change(screen.getByLabelText('对照实体'), { target: { value: 'e1' } });
    expect(screen.getByText('+50.0 个百分点')).toBeTruthy();
    expect(screen.getAllByText('未知（无有效样本）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('不计算差距').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: '同名主体' })[1]); expect(select).toHaveBeenCalledWith('e2');
    expect(screen.getAllByText(/未登记主体/).length).toBeGreaterThan(0); expect(screen.queryByText(/DeepSeek ·/)).toBeNull();
  });
  it('provides scoped strategy links and exposes missing evidence without an authority score', () => {
    render(<StrategicEvidence report={report} projectId="p1" platform="qwen" onOpen={vi.fn()} />);
    expect(screen.getByText('比较全部观察实体').closest('a')?.getAttribute('href')).toBe('/compare?project=p1&auditId=12');
    expect(screen.getByText(/尚无回答与来源的可核验配对/)).toBeTruthy();
    expect(screen.getByText(/未取得实际引用卡片/)).toBeTruthy();
    expect(screen.queryByText('域名权威趋势')).toBeNull();
  });
});
