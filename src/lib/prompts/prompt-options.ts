export const PROMPT_CATEGORY_OPTIONS = [
  { value: "recommend", label: "产品推荐" },
  { value: "compare", label: "产品对比" },
  { value: "evaluate", label: "产品评估" },
  { value: "scenario", label: "场景需求" },
  { value: "problem_solution", label: "问题解决" },
  { value: "alternative_finding", label: "替代方案" },
  { value: "decision_help", label: "决策帮助" },
  { value: "regret_avoidance", label: "避坑与风险" },
  { value: "performance_specs", label: "性能与参数" },
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORY_OPTIONS)[number]["value"];

export const DEFAULT_PROMPT_CATEGORY: PromptCategory = "recommend";

export const PROMPT_CATEGORY_LABELS: Record<PromptCategory, string> = Object.fromEntries(
  PROMPT_CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<PromptCategory, string>;

export function isPromptCategory(value: unknown): value is PromptCategory {
  return PROMPT_CATEGORY_OPTIONS.some((option) => option.value === value);
}
