// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PresenceMetrics, type PresenceMetric } from '@/components/visibility/presence-metrics';
afterEach(cleanup);
const value: PresenceMetric = { entity_id: 'entity', metric: 'cited_archive_presence', status: 'descriptive_only', baseline: { numerator: 0, denominator: 0 }, followup: { numerator: 0, denominator: 0 }, difference: null, interval95: null, descriptive: { baseline: { numerator: 1, denominator: 4 }, followup: { numerator: 2, denominator: 4 } }, included: [], excluded: [{ baseline_sample_id: 'sample', reason: 'cited_archive_incomplete' }], traces: { baseline: { response: [{ citation_id: 'citation', owner_kind: 'snapshot', owner_id: 'snapshot', article_completeness: 'unknown', mention_id: 'mention' }] } } };
const props = { metrics: [value], platformStatus: 'valid_comparison', entities: [{ id: 'entity', name: '云衡' }], runIds: { baseline: 'baseline-run', followup: 'followup-run' } };
describe('independent source measurement populations', () => {
  it('uses the source metric status and descriptive denominator, not the answer platform status', () => { render(<PresenceMetrics {...props} />); expect(screen.getByText('1/4（25.0%）')).toBeTruthy(); expect(screen.getByText('2/4（50.0%）')).toBeTruthy(); expect(screen.getByText(/已存引用正文提及 · 仅可描述/)).toBeTruthy(); expect(screen.getByText('不输出变化结论')).toBeTruthy(); });
  it('keeps unknown archives unknown and opens the correct phase revision for evidence', () => { const open = vi.fn(); render(<PresenceMetrics {...props} onOpen={open} />); fireEvent.click(screen.getByText('查看口径与证据')); expect(screen.getByText(/引用正文缺失/)).toBeTruthy(); expect(screen.getByText(/原文章完整程度：未确认/)).toBeTruthy(); fireEvent.click(screen.getByText('查看保存内容')); expect(open).toHaveBeenCalledWith('baseline-run', 'snapshot', 'snapshot'); });
  it('does not render a missing-data denominator as zero percent', () => { render(<PresenceMetrics {...props} metrics={[{ ...value, status: 'undetermined' }]} />); expect(screen.getAllByText('未知（无有效样本）')).toHaveLength(2); });
});
