export interface PromptRecord {
  text: string;
}

export interface PromptGenerationContext {
  productName?: string | null;
  projectName?: string | null;
  productKeywords?: string[];
}

const GENERIC_PROMPT_PATTERNS = [
  '通用产品',
  '通用品牌',
  '产品xxx',
  '品牌xxx',
  '示例产品',
  '示例品牌',
  'generic product',
  'sample product',
  'placeholder',
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function looksGenericPrompt(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;
  return GENERIC_PROMPT_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function promptMentionsAnyTarget(
  text: string,
  context: PromptGenerationContext,
): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;

  const targets = [
    context.productName,
    context.projectName,
    ...(context.productKeywords ?? []),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return targets.some((target) => normalized.includes(normalize(target)));
}

export function shouldRegeneratePrompts(
  prompts: PromptRecord[],
  context: PromptGenerationContext,
): boolean {
  if (prompts.length === 0) return true;

  const hasTargetMention = prompts.some((prompt) => promptMentionsAnyTarget(prompt.text, context));
  if (!hasTargetMention) return true;

  return prompts.every((prompt) => looksGenericPrompt(prompt.text));
}
