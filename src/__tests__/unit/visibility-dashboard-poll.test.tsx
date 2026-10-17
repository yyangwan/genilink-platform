// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/components/dashboard/use-section-fetch', () => ({ useSectionFetch: vi.fn() }));
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { useVisibilityDashboard } from '@/components/visibility/use-visibility-dashboard';
const data = { schema: 'citation-dashboard-1', project_id: 'p1', enabled: true, processing: true, report: null, latest_audit: null };
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe('read-only dashboard polling', () => {
  it('polls only active work and clears timers for an in-flight read or different project', () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    const state = { data, loading: false, error: false, locked: false, refetch };
    vi.mocked(useSectionFetch).mockImplementation(() => state);
    const { result, rerender, unmount } = renderHook(({ project }) => useVisibilityDashboard(project), { initialProps: { project: 'p1' } });
    act(() => vi.advanceTimersByTime(10000)); expect(refetch).toHaveBeenCalledTimes(1);
    state.loading = true; rerender({ project: 'p1' }); act(() => vi.advanceTimersByTime(20000)); expect(refetch).toHaveBeenCalledTimes(1);
    state.loading = false; rerender({ project: 'p2' }); expect(result.current.data).toBeNull();
    act(() => vi.advanceTimersByTime(20000)); expect(refetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(useSectionFetch).mock.calls.at(-1)?.[0]).toContain('projectId=p2'); unmount();
  });
  it('does not poll terminal or empty results', () => {
    vi.useFakeTimers(); const refetch = vi.fn();
    vi.mocked(useSectionFetch).mockReturnValue({ data: { ...data, processing: false }, loading: false, error: false, locked: false, refetch });
    const { unmount } = renderHook(() => useVisibilityDashboard('p1'));
    act(() => vi.advanceTimersByTime(60000)); expect(refetch).not.toHaveBeenCalled(); unmount();
  });
});
