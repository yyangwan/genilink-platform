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
  | 'seoOptimizationsPerMonth'
  | 'contentScoresPerMonth'
  | 'calendarItemsPerMonth'
  | 'brandVoices'
  | 'contentTemplates';

export type CapabilityLevel = 'none' | 'basic' | 'full' | 'advanced';

export type SubscriptionTierCapabilities = {
  auditReport: CapabilityLevel;
  trendHistoryDays: number;
  optimizationAdvice: CapabilityLevel;
  competitorComparison: CapabilityLevel;
  contentInsights: CapabilityLevel;
  strategicIntelligence: CapabilityLevel;
  sourceAuthority: CapabilityLevel;
  structureEvolution: CapabilityLevel;
  competitorPositioning: CapabilityLevel;
  contentCalendar: CapabilityLevel;
  platformConfig: CapabilityLevel;
  support: CapabilityLevel;
};

export type BillingCapabilityKey = Exclude<keyof SubscriptionTierCapabilities, 'trendHistoryDays'>;

export interface SubscriptionTierDefinition {
  key: SubscriptionTier;
  name: string;
  eyebrow: string;
  description: string;
  badge: string;
  recommended: boolean;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  audience: string;
  modules: ModuleType[];
  highlights: string[];
  features: string[];
  capabilities: SubscriptionTierCapabilities;
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
    name: '入门版',
    eyebrow: 'Lite',
    description: '适合个人或小团队验证 AI 搜索增长机会。',
    badge: '轻量起步',
    recommended: false,
    monthlyPriceCents: 9900,
    yearlyPriceCents: 99900,
    audience: '个人/小团队验证',
    modules: ['visibility', 'content'],
    highlights: ['智见基础分析', '智创基础创作', '个人/小团队验证'],
    features: ['基础网站分析与审计报告', '基础内容创作、优化与评分', '1 个项目 / 1 名成员', '每项目 10 个 AI 监测提示词'],
    capabilities: {
      auditReport: 'basic',
      trendHistoryDays: 30,
      optimizationAdvice: 'basic',
      competitorComparison: 'none',
      contentInsights: 'basic',
      strategicIntelligence: 'none',
      sourceAuthority: 'none',
      structureEvolution: 'none',
      competitorPositioning: 'none',
      contentCalendar: 'basic',
      platformConfig: 'basic',
      support: 'basic',
    },
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
      seoOptimizationsPerMonth: 10,
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
    description: '适合持续开展 AI 搜索增长的团队。',
    badge: '推荐方案',
    recommended: true,
    monthlyPriceCents: 39900,
    yearlyPriceCents: 399900,
    audience: '持续做 AI 搜索增长的团队',
    modules: ['visibility', 'content'],
    highlights: ['完整增长闭环', '完整内容工作流', '推荐团队方案'],
    features: ['完整分析、审计与优化建议', '完整内容创作与日历工作流', '5 个项目 / 5 名成员', '基础战略智能分析'],
    capabilities: {
      auditReport: 'full',
      trendHistoryDays: 365,
      optimizationAdvice: 'full',
      competitorComparison: 'full',
      contentInsights: 'full',
      strategicIntelligence: 'basic',
      sourceAuthority: 'basic',
      structureEvolution: 'basic',
      competitorPositioning: 'basic',
      contentCalendar: 'full',
      platformConfig: 'full',
      support: 'basic',
    },
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
      seoOptimizationsPerMonth: 200,
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
    description: '适合多项目和规模化 AI 搜索运营团队。',
    badge: '规模增长',
    recommended: false,
    monthlyPriceCents: 129900,
    yearlyPriceCents: 1299900,
    audience: '多项目/规模化运营团队',
    modules: ['visibility', 'content'],
    highlights: ['多项目管理', '规模化内容生产', '完整战略智能'],
    features: ['高级分析、审计与优化建议', '规模化内容生产与高级对比', '20 个项目 / 20 名成员', '完整战略智能分析'],
    capabilities: {
      auditReport: 'advanced',
      trendHistoryDays: 730,
      optimizationAdvice: 'advanced',
      competitorComparison: 'advanced',
      contentInsights: 'advanced',
      strategicIntelligence: 'full',
      sourceAuthority: 'full',
      structureEvolution: 'full',
      competitorPositioning: 'full',
      contentCalendar: 'full',
      platformConfig: 'full',
      support: 'full',
    },
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
      seoOptimizationsPerMonth: 1000,
      contentScoresPerMonth: 2000,
      calendarItemsPerMonth: 500,
      brandVoices: 20,
      contentTemplates: 100,
    },
  },
];

const TIER_KEYS: SubscriptionTier[] = ['lite', 'pro', 'max'];
const TIER_RANK: Record<SubscriptionTier, number> = { lite: 1, pro: 2, max: 3 };
const CAPABILITY_RANK: Record<CapabilityLevel, number> = { none: 0, basic: 1, full: 2, advanced: 3 };
const LEVEL_LABELS: Record<CapabilityLevel, string> = { none: '不支持', basic: '基础版', full: '完整版', advanced: '高级版' };

export function getTierDefinition(tier: SubscriptionTier): SubscriptionTierDefinition {
  return SUBSCRIPTION_TIERS.find((item) => item.key === tier)!;
}

function mapTierValues(format: (tier: SubscriptionTierDefinition) => string): Record<SubscriptionTier, string> {
  return Object.fromEntries(TIER_KEYS.map((key) => [key, format(getTierDefinition(key))])) as Record<SubscriptionTier, string>;
}

function limitRow(label: string, limitKey: TierLimitKey, unit: string, zeroLabel = '不支持'): SubscriptionPlanMatrixRow {
  return {
    label,
    limitKey,
    values: mapTierValues((tier) => {
      const value = tier.limits[limitKey];
      return value === 0 ? zeroLabel : `${value} ${unit}`;
    }),
  };
}

function capabilityRow(
  label: string,
  key: BillingCapabilityKey,
  labels: Partial<Record<CapabilityLevel, string>> = {},
): SubscriptionPlanMatrixRow {
  return { label, values: mapTierValues((tier) => labels[tier.capabilities[key]] ?? LEVEL_LABELS[tier.capabilities[key]]) };
}

function formatPrice(priceCents: number, cycle: '月' | '年'): string {
  return `¥${Math.round(priceCents / 100)}/${cycle}`;
}

export const SUBSCRIPTION_PLAN_MATRIX: SubscriptionPlanMatrixGroup[] = [
  {
    title: '价格与适用对象',
    rows: [
      { label: '月付价格', values: mapTierValues((tier) => formatPrice(tier.monthlyPriceCents, '月')) },
      { label: '年付价格', values: mapTierValues((tier) => formatPrice(tier.yearlyPriceCents, '年')) },
      { label: '适合对象', values: mapTierValues((tier) => tier.audience) },
    ],
  },
  {
    title: '团队与项目容量',
    rows: [
      limitRow('项目数', 'projects', '个'),
      limitRow('成员数', 'members', '人'),
      limitRow('主品牌数', 'brands', '个'),
      limitRow('竞品数', 'competitors', '个'),
      { label: '每项目 AI 监测提示词', limitKey: 'promptsPerProject', values: mapTierValues((tier) => `${tier.limits.promptsPerProject} 个`) },
    ],
  },
  {
    title: '智见：分析、审计与战略',
    rows: [
      limitRow('网站分析', 'websiteAnalysesPerMonth', '次/月'),
      limitRow('AI 可见性审计', 'visibilityAuditsPerMonth', '次/月'),
      capabilityRow('审计报告', 'auditReport', { basic: '基础报告', full: '完整报告', advanced: '高级报告' }),
      limitRow('PDF 报告导出', 'pdfExportsPerMonth', '次/月'),
      { label: '趋势历史', values: mapTierValues((tier) => tier.capabilities.trendHistoryDays === 30 ? '最近 30 天' : tier.capabilities.trendHistoryDays === 365 ? '最近 12 个月' : '最近 24 个月') },
      capabilityRow('优化建议', 'optimizationAdvice', { basic: '基础建议', full: '完整建议', advanced: '高级建议' }),
      limitRow('定时审计任务', 'scheduledAudits', '个'),
      capabilityRow('竞品对比', 'competitorComparison', { full: '支持', advanced: '高级对比' }),
      limitRow('多审计对比', 'compareRunsPerMonth', '组/月'),
      capabilityRow('内容洞察', 'contentInsights', { basic: '基础', full: '完整', advanced: '高级' }),
      capabilityRow('战略智能', 'strategicIntelligence'),
      capabilityRow('来源权威趋势', 'sourceAuthority'),
      capabilityRow('结构演化分析', 'structureEvolution'),
      capabilityRow('竞品定位分析', 'competitorPositioning'),
    ],
  },
  {
    title: '智创：内容生产',
    rows: [
      limitRow('内容创作', 'contentGenerationsPerMonth', '篇/月'),
      limitRow('内容优化', 'contentOptimizationsPerMonth', '次/月'),
      limitRow('SEO 优化', 'seoOptimizationsPerMonth', '次/月'),
      limitRow('内容质量评分', 'contentScoresPerMonth', '次/月'),
      capabilityRow('内容日历', 'contentCalendar'),
      limitRow('排期内容数', 'calendarItemsPerMonth', '条/月'),
      limitRow('品牌声音', 'brandVoices', '个'),
      limitRow('内容模板', 'contentTemplates', '个'),
      capabilityRow('平台配置', 'platformConfig', { basic: '基础配置', full: '完整配置' }),
    ],
  },
  {
    title: '服务与扩展',
    rows: [
      { label: '开放接口与系统集成', values: mapTierValues((tier) => tier.integrationStatus) },
      capabilityRow('客户支持', 'support', { basic: '标准支持', full: '优先支持' }),
    ],
  },
];

export function hasCapabilityLevel(actual: CapabilityLevel, required: CapabilityLevel = 'basic'): boolean {
  return CAPABILITY_RANK[actual] >= CAPABILITY_RANK[required];
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
