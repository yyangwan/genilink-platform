// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AnalysisScopeBar } from '@/components/visibility/analysis-scope-bar';
import { BrandScoreWorkspace } from '@/components/visibility/brand-score-workspace';
import { PlatformComparison } from '@/components/visibility/citation-prototype-views';
import { analysisTargets, intelligenceUrl, scopeIssues, scopeResponseIds } from '@/lib/visibility/analysis-scope';
import { emptyTaskScope, readTaskScope } from '@/lib/visibility/task-view';
import { analysisRun } from '../fixtures/analysis-scope';
import { project, runId } from '../fixtures/task-workspace';
afterEach(cleanup);
const scope = { ...emptyTaskScope, own: 'registry:own', comparison: 'entity:rival', platform: 'qwen', scenario: 'implementation' };

it('preserves comparison context and priority across views while run changes clear only old task selections', () => {
  const source = `project=${project}&runId=${runId}&ownTarget=registry%3Aown&compareTarget=entity%3Arival&platform=qwen&scenario=cost&opportunity=old&actionId=old-action&priority=current`;
  const next = intelligenceUrl(source, project, { view: 'sources' });
  expect(readTaskScope(project, next.split('?')[1])).toMatchObject({ own: 'registry:own', comparison: 'entity:rival', platform: 'qwen', scenario: 'cost', action: 'old-action' });
  const newer = intelligenceUrl(source, project, { runId: 'f'.repeat(32) }, true);
  expect(newer).toContain('priority=current'); expect(newer).not.toContain('opportunity='); expect(newer).not.toContain('actionId=');
  expect(newer).toContain('platform=qwen');
  expect(intelligenceUrl(source, 'another-project', { view: 'overview' })).not.toContain('registry');
});

it('retains invalid objects visibly and emits exact choices rather than a default competitor', () => {
  const run = analysisRun(), change = vi.fn();
  render(<AnalysisScopeBar run={run} scope={{ ...scope, comparison: 'gone', platform: 'missing', scenario: 'invalid' }} onChange={change} />);
  expect(screen.getByLabelText('对比品牌')).toHaveValue('gone'); expect(screen.getByRole('status')).toHaveTextContent('未自动替换');
  expect(screen.getByLabelText('需求场景')).toHaveValue('invalid');
  fireEvent.change(screen.getByLabelText('对比品牌'), { target: { value: 'entity:new' } }); expect(change).toHaveBeenCalledWith({ comparison: 'entity:new' });
  expect(scopeIssues(run, { ...scope, own: 'other-project-own' })).toHaveLength(1);
  expect(analysisTargets(run).some(row => row.role === 'unregistered')).toBe(true);
});

it('keeps neutral/brand-free answers in platform/scenario scope and never invents a missing scenario cohort', () => {
  const run = analysisRun();
  expect([...scopeResponseIds(run, scope)]).toEqual(['b'.repeat(32)]);
  expect([...scopeResponseIds(run, { ...scope, scenario: 'cost' })]).toEqual(['6'.repeat(32)]);
  expect(scopeResponseIds(run, { ...scope, platform: 'doubao', scenario: 'cost' }).size).toBe(0);
});

it('uses the selected platform and scenario for score, dimensions and answer evidence instead of whole-audit totals', () => {
  const run = analysisRun();
  const view = render(<BrandScoreWorkspace run={run} mode="overview" scope={scope} showGaps={false} />);
  expect(document.querySelector('.brand-score-conclusion > strong')).toHaveTextContent('60');
  expect(document.querySelector('.brand-score-conclusion > strong')).not.toHaveTextContent('91');
  view.rerender(<BrandScoreWorkspace run={run} mode="overview" scope={{ ...scope, scenario: 'cost' }} showGaps={false} />);
  expect(document.querySelector('.brand-score-conclusion > strong')).toHaveTextContent('—');
  view.rerender(<BrandScoreWorkspace run={run} mode="brands" scope={{ ...scope, comparison: 'gone' }} />);
  expect(document.querySelectorAll('svg circle')).toHaveLength(4); // Only own brand; no default rival.
  expect(screen.queryByLabelText('雷达图对比品牌')).toBeNull();
});

it('does not substitute another platform when the selected prompt has no response on that platform', () => {
  render(<PlatformComparison run={analysisRun()} scope={scope} selectedPlatform="doubao" onOpenAnswer={vi.fn()} onView={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('对照提示词'), { target: { value: '6'.repeat(64) } });
  expect(screen.getByText(/当前问题未取得所选平台的回答/)).toBeInTheDocument();
  expect(document.querySelectorAll('.citation-platform-card')).toHaveLength(0);
});
