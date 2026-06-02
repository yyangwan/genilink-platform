/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState, useEffect, useCallback, useRef } from 'react';

// We test the hook logic directly by extracting the core fetchData function.
// Since useSectionFetch is a React hook and our env is 'node', we test the
// imperative logic paths by importing and calling the inner fetchData callback.
//
// Strategy: re-implement a minimal synchronous version of the branching logic
// to verify null-URL guard behavior, then test the async paths with manual fetch mocking.

// Because the hook uses React primitives internally, we test it by invoking the
// extracted logic in a controlled environment.

// Import the hook's module to spy on its fetch behavior
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';

// Mock the React module to control hook execution
let stateValues: Record<string, any> = {};
let setStateCalls: Record<string, any[]> = {};

vi.mock('react', () => ({
  useState: (initial: any) => {
    const key = `state_${Object.keys(stateValues).length}`;
    if (!stateValues[key]) stateValues[key] = initial;
    const setter = (val: any) => {
      if (typeof val === 'function') {
        stateValues[key] = val(stateValues[key]);
      } else {
        stateValues[key] = val;
      }
      if (!setStateCalls[key]) setStateCalls[key] = [];
      setStateCalls[key].push(stateValues[key]);
    };
    return [stateValues[key], setter];
  },
  useEffect: (fn: any, deps: any[]) => {
    // Execute effect immediately (but store cleanup)
    (globalThis as any).__effectCleanup = fn();
  },
  useCallback: (fn: any, deps: any[]) => fn,
  useRef: (initial: any) => ({ current: initial }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('useSectionFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateValues = {};
    setStateCalls = {};
    delete (globalThis as any).__effectCleanup;
  });

  afterEach(() => {
    // Run cleanup
    if ((globalThis as any).__effectCleanup) {
      (globalThis as any).__effectCleanup();
    }
  });

  describe('null URL guard (NEW in this diff)', () => {
    it('should return loading=true and not fetch when url is null', () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

      const result = useSectionFetch<unknown>(null);

      // Should not have called fetch at all
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return loading=true when url is null (projectId not resolved)', () => {
      const result = useSectionFetch<unknown>(null);

      // The initial state is loading=true, and the null guard keeps it that way
      expect(result.loading).toBe(true);
    });

    it('should return null data and no error when url is null', () => {
      const result = useSectionFetch<unknown>(null);

      expect(result.data).toBeNull();
      expect(result.error).toBe(false);
      expect(result.locked).toBe(false);
    });
  });

  describe('valid URL paths (pre-existing behavior)', () => {
    it('should call fetch with the provided URL', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });

      useSectionFetch('/api/integration/audits?projectId=123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/integration/audits?projectId=123',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          headers: { Accept: 'application/json' },
        }),
      );
    });
  });
});
