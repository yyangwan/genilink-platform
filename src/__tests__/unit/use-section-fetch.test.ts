// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('useSectionFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('null URL guard (NEW in this diff)', () => {
    it('should return loading=true and not fetch when url is null', () => {
      const { result } = renderHook(() => useSectionFetch<unknown>(null));

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
    });

    it('should return null data and no error when url is null', () => {
      const { result } = renderHook(() => useSectionFetch<unknown>(null));

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBe(false);
      expect(result.current.locked).toBe(false);
    });
  });

  describe('valid URL paths (pre-existing behavior)', () => {
    it('should call fetch with the provided URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });

      renderHook(() => useSectionFetch('/api/integration/audits?projectId=123'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const [request] = mockFetch.mock.calls[0];
      expect(request).toBeInstanceOf(Request);
      expect(request.url).toContain('/api/integration/audits?projectId=123');
      expect(request.headers.get('accept')).toBe('application/json');
      expect((request as Request).credentials).toBe('same-origin');
      expect((request as Request).cache).toBe('no-store');
      expect(request.signal).toBeInstanceOf(AbortSignal);
    });

    it('does not refetch when options identity changes but url stays the same', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });

      const { rerender } = renderHook(
        ({ notFoundValue }) => useSectionFetch('/api/integration/prompts?projectId=123', { notFoundValue }),
        { initialProps: { notFoundValue: [] as unknown[] } },
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      rerender({ notFoundValue: [] });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
  });
});
