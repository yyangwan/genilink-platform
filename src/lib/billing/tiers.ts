import type { ModuleType, SubscriptionTier } from '@/types/billing';

export type TierLimitKey = 'projects' | 'members';

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
    modules: ['visibility'],
    features: ['智见：官网诊断与可见性分析', '1 个项目 / 1 名成员', '基础审计报告', '标准优化建议'],
    limits: { projects: 1, members: 1 },
  },
  {
    key: 'pro',
    name: '专业版',
    eyebrow: 'Pro',
    description: '适合需要持续分析并把洞察转为内容增长的团队。',
    badge: '推荐方案',
    recommended: true,
    modules: ['visibility', 'content'],
    features: ['智见全部功能 + 智创内容生产', '5 个项目 / 5 名成员', '进阶分析与内容工作流', '优先支持'],
    limits: { projects: 5, members: 5 },
  },
  {
    key: 'max',
    name: '高级版',
    eyebrow: 'Max',
    description: '适合多项目、规模化内容生产与系统集成的团队。',
    badge: '规模增长',
    recommended: false,
    modules: ['visibility', 'content', 'api_access'],
    features: ['智见与智创全部功能', '20 个项目 / 20 名成员', 'API 接入与规模化工作流', '高级支持'],
    limits: { projects: 20, members: 20 },
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
