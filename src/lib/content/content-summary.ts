import type { ContentSummary } from '@/types';

export type ContentSummaryItem = {
  id: string;
  title: string;
  platform: string;
  status: string;
  createdAt: string;
};

export type AnalyticsSummaryResponse = {
  summary?: {
    totalContent?: number;
    publishedCount?: number;
    avgQualityScore?: number | null;
  };
  recentActivity?: Array<{
    id: string;
    title: string;
    status: string;
    projectName: string;
    createdAt: string;
  }>;
};

export function buildContentSummary(
  contentItems: ContentSummaryItem[],
  analytics: AnalyticsSummaryResponse | null,
  serviceAvailable = true,
): ContentSummary {
  const sortedContentItems = [...contentItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const sortedRecentActivity = [...(analytics?.recentActivity ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const recentContent = contentItems.length > 0
    ? sortedContentItems.slice(0, 5).map(({ id, title, platform, createdAt }) => ({
        id,
        title,
        platform,
        createdAt,
      }))
    : sortedRecentActivity.slice(0, 5).map(({ id, title, createdAt }) => ({
        id,
        title,
        platform: 'generic',
        createdAt,
      }));

  const totalContent =
    typeof analytics?.summary?.totalContent === 'number'
      ? analytics.summary.totalContent
      : contentItems.length;

  const publishedCount =
    typeof analytics?.summary?.publishedCount === 'number'
      ? analytics.summary.publishedCount
      : contentItems.filter((item) => item.status === 'published').length;

  const qualityAvg =
    typeof analytics?.summary?.avgQualityScore === 'number'
      ? analytics.summary.avgQualityScore
      : null;

  return {
    totalContent,
    publishedCount,
    recentContent,
    qualityAvg,
    _meta: {
      projectCount: contentItems.length,
      serviceAvailable,
    },
  };
}
