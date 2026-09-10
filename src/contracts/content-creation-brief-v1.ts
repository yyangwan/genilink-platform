/**
 * ContentCreationBriefV1 — 智见建议到智创内容的版本化业务契约（TS 视图）。
 *
 * 与 contracts/content-creation-brief-v1.schema.json 一一对应；
 * src/contracts/contracts.test.ts 验证 TS 常量、fixtures 与 schema 三者不漂移。
 * 修改本文件必须同步修改 schema 与两仓库的 contracts/ 目录（内容逐字节一致）。
 */

export const BRIEF_SCHEMA_VERSION = 1 as const;

/** 第一版开放生成的平台（ContentOS 已实现生成器的平台，设计 §5.5）。 */
export type SupportedGenerationPlatform = "wechat" | "weibo" | "xiaohongshu" | "douyin";

export const SUPPORTED_GENERATION_PLATFORMS: readonly SupportedGenerationPlatform[] = [
  "wechat",
  "weibo",
  "xiaohongshu",
  "douyin",
];

/** Portal 仍会展示但当前不能自动生成的平台及其原因。 */
export const UNSUPPORTED_PLATFORM_REASONS: Readonly<Record<string, string>> = {
  zhihu: "generator_not_implemented",
  toutiao: "generator_not_implemented",
};

export type BriefContentType =
  | "faq"
  | "guide"
  | "comparison"
  | "case_study"
  | "thought_leadership"
  | "checklist"
  | "explainer";

export type BriefStatus =
  | "baseline_ready"
  | "refining"
  | "ready"
  | "confirmed"
  | "archived";

export type RefinementStatus = "queued" | "running" | "succeeded" | "fallback" | "skipped";

export type EffectiveSource = "rules" | "llm" | "user";

/** 字段长度与数量限制（设计 §8.3）。 */
export const BRIEF_LIMITS = {
  topicMaxLength: 200,
  titleCandidateMaxCount: 5,
  titleCandidateMaxLength: 120,
  outlineMinItems: 4,
  outlineMaxItems: 12,
  outlineHeadingMaxLength: 120,
  outlinePurposeMaxLength: 800,
  keywordMaxCount: 20,
  keywordMaxLength: 80,
  referenceMaxCount: 20,
  referenceUrlMaxLength: 2048,
  constraintMaxCount: 20,
  constraintMaxLength: 500,
  notesMaxLength: 4000,
} as const;

/** 规范来源快照的限制（设计 §8.3/§8.4）。 */
export const SNAPSHOT_LIMITS = {
  textMaxLength: 500,
  descriptionMaxLength: 4000,
  evidenceSummaryMaxLength: 4000,
  expectedResultMaxLength: 4000,
  contentOutlineMaxLength: 4000,
  measurementPlanMaxLength: 4000,
  successMetricMaxLength: 2000,
  auditFindingMaxLength: 2000,
  acceptanceCriterionMaxLength: 2000,
  sourceArrayMax: 20,
  tagArrayMax: 20,
  tagMaxLength: 200,
  sourceUrlMaxLength: 2048,
  /** 单次跨服务 JSON 的最大字节数。 */
  maxPayloadBytes: 128 * 1024,
} as const;

/**
 * ContentOS 内部保存的规范来源快照：只允许白名单字段（设计 §8.4）。
 * 未知字段、令牌、Cookie、请求头与用户隐私信息不得进入。
 */
export interface VisibilitySuggestionSnapshotV1 {
  schemaVersion: 1;
  suggestionId: string;
  text: string;
  description?: string;
  category?: string;
  priority?: string;
  actionType?: string;
  typeTags: string[];
  keywords: string[];
  contentOutline?: string;
  evidenceSummary?: string;
  auditFindings: string[];
  acceptanceCriteria: string[];
  expectedResult?: string;
  successMetric?: string;
  measurementPlan?: string;
  evidenceSources: string[];
  actionSources: string[];
  requestedChannels: string[];
}

/** 项目与产品快照：LLM 提炼与锁定约束的事实边界来源。 */
export interface ProjectSnapshotV1 {
  schemaVersion: 1;
  projectId: string;
  name: string;
  url?: string;
  industry?: string;
  productName?: string;
  productKeywords: string[];
  productDescription?: string;
}

export interface BriefOutlineSection {
  id: string;
  heading: string;
  purpose: string;
  evidenceRefs: string[];
}

export interface BriefReference {
  id: string;
  url: string;
  label?: string;
  source: "suggestion" | "project" | "user";
}

export interface PlatformPlanItem {
  platform: string;
  capability: "supported" | "unsupported";
  selected: boolean;
  reason?: string;
}

export interface ContentCreationBriefV1 {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  projectId: string;
  revision: number;
  status: BriefStatus;

  source: {
    type: "visibility_suggestion";
    suggestionId: string;
    sourceHash: string;
    auditId?: string;
    reportId?: string;
  };

  strategy: {
    objective: string;
    audience?: string;
    intent: string;
    contentType: BriefContentType;
  };

  editorial: {
    topic: string;
    titleCandidates: string[];
    outline: BriefOutlineSection[];
    keywords: string[];
    references: BriefReference[];
    notes?: string;
  };

  platformPlan: PlatformPlanItem[];

  constraints: {
    locked: {
      mustMention: string[];
      avoidMention: string[];
      allowedClaims: string[];
      forbiddenClaims: string[];
      factualityPolicy: "verified_sources_only";
    };
    editable: {
      mustMention: string[];
      avoidMention: string[];
    };
  };

  generationMeta: {
    effectiveSource: EffectiveSource;
    rulesVersion: string;
    promptVersion?: string;
    model?: string;
    fallbackReason?: string;
    refinementBaseRevision?: number;
  };

  createdAt: string;
  updatedAt: string;
}

/** Portal → ContentOS 创建来源 Brief 的请求体（服务间调用）。 */
export interface CreateContentBriefRequestV1 {
  sourceType?: "visibility_suggestion";
  sourceSnapshot: VisibilitySuggestionSnapshotV1;
  projectSnapshot: ProjectSnapshotV1;
  suggestionRef?: {
    reportId?: string;
    auditId?: string;
  };
}
