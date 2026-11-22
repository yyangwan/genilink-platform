"use client";
import { useEffect } from 'react';
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import type { CitationDashboard } from '@/types/citation-dashboard';

export function useVisibilityDashboard(projectId: string, view: 'overview' | 'collection' = 'overview') {
  const result = useSectionFetch<CitationDashboard>(`/api/dashboard/visibility?${new URLSearchParams({ projectId, ...(view === 'collection' ? { view } : {}) })}`);
  const data = result.data?.project_id === projectId && result.data.schema === 'citation-dashboard-1' ? result.data : null;
  const { refetch, loading } = result;
  useEffect(() => {
    if (loading || !(data?.processing || view === 'collection' && data?.context_sync_pending)) return;
    const timer = setTimeout(refetch, 10000);
    return () => clearTimeout(timer);
  }, [data, loading, refetch, view]);
  return { ...result, data };
}
