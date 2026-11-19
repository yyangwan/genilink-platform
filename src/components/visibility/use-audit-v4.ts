'use client';

import { useCallback, useEffect, useState } from 'react';
import { auditApi, readAuditJson, type AuditCaptureSummary } from '@/lib/visibility/v4-audit';

export function useAuditResource<T>(url: string | null, version?: unknown, retainPrevious = false) {
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<{
    url: string;
    request: number;
    version: unknown;
    data: T | null;
    error: string;
  } | null>(null);
  const refetch = useCallback(() => setRequest(value => value + 1), []);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    readAuditJson<T>(url, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setResult({ url, request, version, data, error: '' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult(previous => ({
          url, request, version, data: previous?.url === url ? previous.data : null,
          error: error instanceof Error ? error.message : '审计数据暂不可用。',
        }));
      });
    return () => controller.abort();
  }, [url, request, version]);

  const entry = result?.url === url ? result : null;
  const loading = !!url && (!entry || entry.request !== request || entry.version !== version);
  return { data: entry?.data ?? (retainPrevious && loading ? result?.data ?? null : null), error: loading ? '' : entry?.error || '', loading, refetch };
}

export function useAuditCapture(projectId: string, auditId: string) {
  const state = useAuditResource<AuditCaptureSummary>(auditId ? auditApi('captureV4', projectId, auditId) : null);
  const data = state.data?.audit_id === auditId ? state.data : null;
  const pollAfter = data?.poll_after_ms;
  const { loading, refetch } = state;
  const error = state.error || (state.data && !data ? '返回的采集状态与当前审计不匹配。' : '');
  useEffect(() => {
    if (!pollAfter || error || loading) return;
    const timer = window.setTimeout(refetch, pollAfter);
    return () => window.clearTimeout(timer);
  }, [pollAfter, error, loading, refetch]);
  return { ...state, data, error };
}
