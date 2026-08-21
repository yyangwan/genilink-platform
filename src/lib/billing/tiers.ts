import type { ModuleType, SubscriptionTier } from '@/types/billing';

export type TierLimitKey =
  | 'projects'
  | 'members'
  | 'brands'
  | 'competitors'
  | 'promptsPerProject'
  | 'websiteAnalysesPerMonth'
  | 'visibilityAuditsPerMonth'
  | 'scheduledAudits'
  | 'compareRunsPerMonth'
  | 'pdfExportsPerMonth'
  | 'contentGenerationsPerMonth'
  | 'contentOptimizationsPerMonth'
  | 'contentScoresPerMonth'
  | 'calendarItemsPerMonth'
  | 'brandVoices'
  | 'contentTemplates';

export interface SubscriptionTierDefinition {
  key: SubscriptionTier;
  name: string;
  eyebrow: string;
  description: string;
  badge: string;
  recommended: boolean;
  modules: ModuleType[];
  features: string[];
  limits: Record<TierLimitKey, number>;
}

export const SUBSCRIPTION_TIERS: SubscriptionTierDefinition[] = [
  {
    key: 'lite',
    name: '轻量版',
    eyebrow: 'Lite',
    description: '适合刚开始验证 AI 搜索机会的个人和小团队。',
    badge: '轻量起步',
    recommended: false,
    modules: ['visibility', 'content'],
    features: ['基础网站分析与官网诊断', '1 个项目 / 1 名成员', '每项目 10 条提示词', '基础审计报告与标准建议'],
    limits: {
      projects: 1,
      members: 1,
      brands: 1,
      competitors: 2,
      promptsPerProject: 10,
      websiteAnalysesPerMonth: 10,
      visibilityAuditsPerMonth: 3,
      scheduledAudits: 0,
      compareRunsPerMonth: 0,
      pdfExportsPerMonth: 1,
      contentGenerationsPerMonth: 10,
      contentOptimizationsPerMonth: 10,
      contentScoresPerMonth: 30,
      calendarItemsPerMonth: 10,
      brandVoices: 1,
      contentTemplates: 5,
    },
  },
  {
    key: 'pro',
    name: '专业版',
    eyebrow: 'Pro',
    description: '适合需要持续分析并把洞察转为内容增长的团队。',
    badge: '推荐方案',
    recommended: true,
    modules: ['visibility', 'content'],
    features: ['智见全部功能 + 智创内容生产', '5 个项目 / 5 名成员', '每项目 10 条提示词', '竞品对比、日历排期与优先支持'],
    limits: {
      projects: 5,
      members: 5,
      brands: 5,
      competitors: 10,
      promptsPerProject: 10,
      websiteAnalysesPerMonth: 100,
      visibilityAuditsPerMonth: 30,
      scheduledAudits: 10,
      compareRunsPerMonth: 5,
      pdfExportsPerMonth: 30,
      contentGenerationsPerMonth: 100,
      contentOptimizationsPerMonth: 200,
      contentScoresPerMonth: 300,
      calendarItemsPerMonth: 100,
      brandVoices: 5,
      contentTemplates: 20,
    },
  },
  {
    key: 'max',
    name: '高级版',
    eyebrow: 'Max',
    description: '适合多项目、规模化内容生产与高级分析的团队。',
    badge: '规模增长',
    recommended: false,
    modules: ['visibility', 'content'],
    features: ['智见与智创全部功能', '20 个项目 / 20 名成员', '每项目 10 条提示词', '高级分析、规模化工作流与高级支持'],
    limits: {
      projects: 20,
      members: 20,
      brands: 20,
      competitors: 50,
      promptsPerProject: 10,
      websiteAnalysesPerMonth: 500,
      visibilityAuditsPerMonth: 200,
      scheduledAudits: 100,
      compareRunsPerMonth: 50,
      pdfExportsPerMonth: 200,
      contentGenerationsPerMonth: 500,
      contentOptimizationsPerMonth: 1000,
      contentScoresPerMonth: 2000,
      calendarItemsPerMonth: 500,
      brandVoices: 20,
      contentTemplates: 100,
    },
  },
];

const TIER_RANK: Record<SubscriptionTier, number> = { lite: 1, pro: 2, max: 3 };

export function getTierDefinition(tier: SubscriptionTier): SubscriptionTierDefinition {
  return SUBSCRIPTION_TIERS.find((item) => item.key === tier)!;
}

export function getTierFromPlanKey(planKey: string | null | undefined): SubscriptionTier | null {
  const match = planKey?.match(/^suite-(lite|pro|max)-(monthly|yearly)$/);
  return (match?.[1] as SubscriptionTier | undefined) ?? null;
}

export function isUpgrade(currentTier: SubscriptionTier | null, targetTier: SubscriptionTier): boolean {
  return currentTier === null || TIER_RANK[targetTier] > TIER_RANK[currentTier];
}

export function highestTier(tiers: Array<SubscriptionTier | null | undefined>): SubscriptionTier | null {
  return tiers.reduce<SubscriptionTier | null>((current, tier) => {
    if (!tier) return current;
    return !current || TIER_RANK[tier] > TIER_RANK[current] ? tier : current;
  }, null);
}
