"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback, useRef } from "react";

export interface SectionFetchState<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  locked: boolean;
  refetch: () => void;
}

export interface SectionFetchOptions<T> {
  notFoundValue?: T;
}

/**
 * Per-section data fetching hook.
 * - Handles AbortController cleanup on unmount or URL change.
 * - Detects 403 BillingError responses and sets `locked` flag.
 */
export function useSectionFetch<T>(url: string | null, options: SectionFetchOptions<T> = {}): SectionFetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [locked, setLocked] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const notFoundValueRef = useRef<T | undefined>(options.notFoundValue);

  useEffect(() => {
    notFoundValueRef.current = options.notFoundValue;
  }, [options.notFoundValue]);

  const fetchData = useCallback(async () => {
    // Skip if no URL (e.g. projectId not yet resolved)
    if (!url) {
      setLoading(false);
      setError(false);
      setLocked(false);
      setData(null);
      return;
    }

    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(false);
    setLocked(false);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (res.status === 404 && notFoundValueRef.current !== undefined) {
        setData(notFoundValueRef.current);
        setLoading(false);
        return;
      }

      // 403 = billing/subscription issue
      if (res.status === 403) {
        setLocked(true);
        setLoading(false);
        setData(null);
        return;
      }

      if (!res.ok) {
        setError(true);
        setLoading(false);
        setData(null);
        return;
      }

      const json = (await res.json()) as T;
      setData(json);
      setLoading(false);
    } catch (err) {
      // Ignore abort errors - they are intentional
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setError(true);
      setLoading(false);
      setData(null);
    }
  }, [url]);
  useEffect(() => {
    fetchData();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchData]);

  return { data, loading, error, locked, refetch: fetchData };
}

