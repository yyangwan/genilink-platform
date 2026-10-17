"use client";
import { useEffect } from 'react';
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import type { CitationDashboard } from '@/types/citation-dashboard';

export function useVisibilityDashboard(projectId: string) {
  const result = useSectionFetch<CitationDashboard>(`/api/dashboard/visibility?${new URLSearchParams({ projectId })}`);
  const data = result.data?.project_id === projectId && result.data.schema === 'citation-dashboard-1' ? result.data : null;
  const { refetch, loading } = result;
  useEffect(() => {
    if (!data?.processing || loading) return;
    const timer = setTimeout(refetch, 10000);
    return () => clearTimeout(timer);
  }, [data, loading, refetch]);
  return { ...result, data };
}
