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
  highlights: string[];
  features: string[];
  contentScope: string;
  supportLevel: string;
  integrationStatus: string;
  limits: Record<TierLimitKey, number>;
}

export type SubscriptionPlanMatrixRow = {
  label: string;
  values: Record<SubscriptionTier, string>;
  limitKey?: TierLimitKey;
};

export type SubscriptionPlanMatrixGroup = {
  title: string;
  rows: SubscriptionPlanMatrixRow[];
};

export const SUBSCRIPTION_TIERS: SubscriptionTierDefinition[] = [
  {
    key: 'lite',
    name: '轻量版',
    eyebrow: 'Lite',
    description: '适合刚开始验证 AI 搜索机会的个人和小团队。',
    badge: '轻量起步',
    recommended: false,
    modules: ['visibility', 'content'],
    highlights: ['智见基础分析', '智创基础创作', '个人/小团队起步'],
    features: ['基础网站分析与官网诊断', '智创基础：内容生成、优化与评分', '1 个项目 / 1 名成员', '每项目 10 条提示词'],
    contentScope: '基础创作工具',
    supportLevel: '标准支持',
    integrationStatus: '不支持',
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
      calendarItemsPerMonth: 0,
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
    highlights: ['完整增长闭环', '内容工作流', '推荐团队方案'],
    features: ['完整的智见分析与审计工作流', '完整的智创内容工作流', '5 个项目 / 5 名成员', '每项目 10 条提示词'],
    contentScope: '完整内容工作流',
    supportLevel: '优先支持',
    integrationStatus: '不支持',
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
    highlights: ['多项目管理', '规模化生产', '高级分析支持'],
    features: ['规模化智见分析与审计', '规模化智创内容生产', '20 个项目 / 20 名成员', '每项目 10 条提示词'],
    contentScope: '规模化内容生产',
    supportLevel: '高级支持',
    integrationStatus: '暂未开放',
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

const TIER_KEYS: SubscriptionTier[] = ['lite', 'pro', 'max'];

function mapTierValues(format: (tier: SubscriptionTierDefinition) => string): Record<SubscriptionTier, string> {
  return Object.fromEntries(
    TIER_KEYS.map((key) => [key, format(getTierDefinition(key))]),
  ) as Record<SubscriptionTier, string>;
}

function limitRow(
  label: string,
  limitKey: TierLimitKey,
  unit: string,
  zeroLabel = '不支持',
): SubscriptionPlanMatrixRow {
  return {
    label,
    limitKey,
    values: mapTierValues((tier) => {
      const value = tier.limits[limitKey];
      return value === 0 ? zeroLabel : `${value} ${unit}`;
    }),
  };
}

export const SUBSCRIPTION_PLAN_MATRIX: SubscriptionPlanMatrixGroup[] = [
  {
    title: '团队与项目容量',
    rows: [
      limitRow('项目数量', 'projects', '个'),
      limitRow('团队成员', 'members', '人'),
      limitRow('品牌资产', 'brands', '个'),
      limitRow('竞品品牌', 'competitors', '个'),
      {
        label: '提示词数量',
        limitKey: 'promptsPerProject',
        values: mapTierValues((tier) => `每项目 ${tier.limits.promptsPerProject} 条`),
      },
    ],
  },
  {
    title: '智见：分析与审计',
    rows: [
      limitRow('网站分析', 'websiteAnalysesPerMonth', '次/月'),
      limitRow('可见性审计', 'visibilityAuditsPerMonth', '次/月'),
      limitRow('定时审计任务', 'scheduledAudits', '个'),
      limitRow('竞品/审计对比', 'compareRunsPerMonth', '次/月'),
      limitRow('PDF 报告导出', 'pdfExportsPerMonth', '次/月'),
    ],
  },
  {
    title: '智创：内容生产',
    rows: [
      { label: '智创功能范围', values: mapTierValues((tier) => tier.contentScope) },
      limitRow('内容生成', 'contentGenerationsPerMonth', '次/月'),
      limitRow('内容优化', 'contentOptimizationsPerMonth', '次/月'),
      limitRow('内容评分', 'contentScoresPerMonth', '次/月'),
      limitRow('内容日历排期', 'calendarItemsPerMonth', '次/月'),
      limitRow('品牌声音', 'brandVoices', '个'),
      limitRow('内容模板', 'contentTemplates', '个'),
    ],
  },
  {
    title: '服务与扩展',
    rows: [
      { label: '标准优化建议', values: mapTierValues(() => '支持') },
      { label: '支持级别', values: mapTierValues((tier) => tier.supportLevel) },
      { label: '开放接口与系统集成', values: mapTierValues((tier) => tier.integrationStatus) },
    ],
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
