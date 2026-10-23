// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { EvidenceRun } from '@/types/intelligence';
import { BrandScoreWorkspace } from '@/components/visibility/brand-score-workspace';

afterEach(cleanup);
const aggregate = (score: number | null) => ({ rule_version: 'brand-visibility-v1', cohort_hash: 'hash', score, covered_weight: score === null ? 0 : 1, missing_sample_ids: [], status: score === null ? 'pending' : 'complete' });
function fixture(): EvidenceRun {
  return { id: 'run', responses: [], sources: [], coverage: {}, summary: {
    entities: [{ id: 'own', name: '自有品牌甲', kind: 'brand', role: 'own', identity_status: 'confirmed' },
      { id: 'other', name: '对比品牌乙', kind: 'brand', role: 'unregistered', identity_status: 'confirmed' }],
    brand_evaluation: { version: 'brand-visibility-v1', status: 'partial', score: null,
      brand_scores: [{ entity_id: 'own', ...aggregate(null) }], answer_scores: [],
      comparison: { gaps: [], scope_scores: ['platform', 'overall'].flatMap(axis => ['own', 'other'].map(entity_id => ({ entity_id, axis, scope: axis === 'overall' ? 'all' : 'qwen', total: aggregate(null),
        dimensions: { presence: aggregate(70), recommendation: aggregate(50), position: aggregate(null), reasons: aggregate(60) } }))) } },
  } } as unknown as EvidenceRun;
}

describe('brand evaluation presentation', () => {
  it('does not invent a score for an older report without evaluation data', () => {
    const { container } = render(<BrandScoreWorkspace run={{ summary: {}, responses: [], coverage: {} } as unknown as EvidenceRun} />);
    expect(screen.getByRole('status').textContent).toContain('当前审计修订尚未生成新版评分');
    expect(screen.getByRole('heading', { name: '品牌能力轮廓' })).toBeTruthy();
    expect(container.querySelectorAll('circle')).toHaveLength(0);
    expect(screen.getByRole('img')).toBeTruthy();
  });
  it('keeps unknown radar dimensions empty rather than plotting zeros', () => {
    const { container } = render(<BrandScoreWorkspace run={fixture()} />);
    expect(container.querySelectorAll('svg circle').length).toBe(6);
    expect(container.querySelectorAll('svg polygon').length).toBe(4); // Grid only; incomplete series do not close.
    expect(screen.getByLabelText('雷达图对比品牌')).toBeTruthy();
    expect(screen.getByText(/未取得完整评分时/)).toBeTruthy();
  });
  it('shows pending platform bars without fabricating zero-valued bars', () => {
    const select = vi.fn();
    render(<BrandScoreWorkspace run={fixture()} mode="platforms" onPlatformSelect={select} />);
    expect(screen.getAllByText('待分析')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /的平台分析/ }));
    expect(select).toHaveBeenCalledWith('qwen');
  });
  it('lets the user trace a score back to its own response', () => {
    const run = fixture();
    run.summary.brand_evaluation!.answer_scores = [{ entity_id: 'own', response_id: 'response-1', platform: 'qwen', dimensions: { presence: 70, recommendation: 50, position: null, reasons: 60 } }] as NonNullable<EvidenceRun['summary']['brand_evaluation']>['answer_scores'];
    const open = vi.fn();
    render(<BrandScoreWorkspace run={run} onEvidence={open} />);
    fireEvent.click(screen.getAllByText('查看评分依据')[0]);
    fireEvent.click(screen.getByRole('button', { name: '查看回答原文 →' }));
    expect(open).toHaveBeenCalledWith('response-1');
  });
});
