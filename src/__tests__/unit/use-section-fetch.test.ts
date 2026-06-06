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
      expect(result.current.loading).toBe(true);
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

      const [request, init] = mockFetch.mock.calls[0];
      expect(request).toBeInstanceOf(Request);
      expect(request.url).toContain('/api/integration/audits?projectId=123');
      expect(request.headers.get('accept')).toBe('application/json');
      expect(request.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
