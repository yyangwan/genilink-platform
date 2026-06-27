import {
  createContentBriefFromSuggestion,
  filterSpecificReferenceUrls,
  type ContentBrief,
  type SuggestionForContentBrief,
} from "@/lib/content/content-brief";

export interface ProjectBriefContext {
  id: string;
  name: string | null;
  url: string | null;
  industry: string | null;
  productName: string | null;
  productKeywords: string[];
  productDescription: string | null;
  productUrl: string | null;
}

interface ChatChoice {
  message?: {
    content?: string;
  };
}

interface ChatResponse {
  choices?: ChatChoice[];
}

function llmConfig() {
  const apiKey = process.env.CONTENT_BRIEF_LLM_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.CONTENT_BRIEF_LLM_BASE_URL || process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.CONTENT_BRIEF_LLM_MODEL || process.env.LLM_MODEL || "gpt-4o-mini";
  if (!apiKey) return null;
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, ""), model };
}

function extractJson(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  return trimmed.slice(start, end + 1);
}

function stringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function withProjectBoundary(fallback: ContentBrief, project: ProjectBriefContext, allowedReferences: string[]): ContentBrief {
  const boundaryLines = [
    project.name ? `项目边界：围绕「${project.name}」展开，不生成与项目无关的行业泛内容。` : "",
    project.productName ? `产品边界：内容必须服务于「${project.productName}」。` : "",
    project.productDescription ? `产品说明：${project.productDescription}` : "",
    project.productKeywords.length > 0 ? `必须覆盖的产品关键词：${project.productKeywords.join("、")}` : "",
    project.productUrl ? `产品链接：${project.productUrl}` : "",
  ].filter(Boolean);

  return {
    ...fallback,
    references: allowedReferences.join("\n"),
    notes: [...fallback.notes.split(/\r?\n/).filter(Boolean), ...boundaryLines].join("\n"),
    mustMention: [
      ...(fallback.mustMention ?? []),
      project.productName ?? "",
      ...project.productKeywords,
    ].filter(Boolean),
    avoid: [
      ...(fallback.avoid ?? []),
      "不要脱离当前项目、产品和审计建议去生成泛行业内容",
      "不要编造客户案例、数据指标、第三方背书或不存在的参考链接",
    ],
  };
}

function normalizeBrief(candidate: unknown, fallback: ContentBrief, allowedReferences: string[]): ContentBrief {
  const record = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : {};

  const modelReferences = filterSpecificReferenceUrls(stringArray(record.references, 8));
  const references = modelReferences.filter((url) => allowedReferences.includes(url));

  return {
    topic: safeString(record.topic) || fallback.topic,
    keyPoints: stringArray(record.keyPoints, 8).length > 0 ? stringArray(record.keyPoints, 8) : fallback.keyPoints,
    references: (references.length > 0 ? references : allowedReferences).join("\n"),
    notes: safeString(record.notes) || fallback.notes,
    platforms: stringArray(record.platforms, 5).length > 0 ? stringArray(record.platforms, 5) : fallback.platforms,
    contentType: safeString(record.contentType) || fallback.contentType,
    intent: safeString(record.intent) || fallback.intent,
    titleCandidates: stringArray(record.titleCandidates, 5),
    mustMention: stringArray(record.mustMention, 8),
    avoid: stringArray(record.avoid, 8),
  };
}

function buildPrompt(project: ProjectBriefContext, suggestion: SuggestionForContentBrief, allowedReferences: string[], fallback: ContentBrief) {
  return [
    {
      role: "system",
      content:
        "You are a senior Chinese content strategist. Convert visibility optimization suggestions into a practical content creation brief. Return strict JSON only. Do not invent facts, customers, metrics, or URLs. References must be selected only from the allowedReferences list.",
    },
    {
      role: "user",
      content: JSON.stringify({
        instructions: {
          language: "zh-CN",
          goal: "Analyze the suggestion deeply and produce fields for AI content creation, not a mechanical field split.",
          requiredJsonShape: {
            topic: "A publishable content topic, specific to the project/product and the visibility gap.",
            contentType: "faq | guide | comparison | case_study | thought_leadership | checklist | explainer",
            intent: "The user/search intent this content should satisfy.",
            keyPoints: ["4-8 concrete arguments or sections"],
            references: ["Only concrete article/page URLs from allowedReferences. Use [] if none."],
            notes: "Writing constraints, project/product boundary, audit context, success metric, and what to avoid.",
            platforms: ["wechat | weibo | douyin | xiaohongshu | toutiao | zhihu"],
            titleCandidates: ["2-5 candidate titles"],
            mustMention: ["product capabilities, keywords, proof points that must appear"],
            avoid: ["things the generation must not do"],
          },
        },
        project: {
          id: project.id,
          name: project.name,
          url: project.url,
          industry: project.industry,
          productName: project.productName,
          productKeywords: project.productKeywords,
          productDescription: project.productDescription,
          productUrl: project.productUrl,
        },
        suggestion,
        allowedReferences,
        deterministicFallback: fallback,
      }),
    },
  ];
}

export async function generateContentBriefFromSuggestion(
  project: ProjectBriefContext,
  suggestion: SuggestionForContentBrief,
): Promise<ContentBrief & { generatedBy: "llm" | "rules" }> {
  const baseFallback = createContentBriefFromSuggestion(suggestion);
  const allowedReferences = filterSpecificReferenceUrls([
    ...(suggestion.action_sources ?? []),
    ...(suggestion.evidence_sources ?? []),
  ]);
  const fallback = withProjectBoundary(baseFallback, project, allowedReferences);
  const config = llmConfig();

  if (!config) {
    return { ...fallback, generatedBy: "rules" };
  }

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildPrompt(project, suggestion, allowedReferences, fallback),
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return { ...fallback, generatedBy: "rules" };
    }

    const data = await res.json() as ChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { ...fallback, generatedBy: "rules" };
    }

    const json = extractJson(content);
    if (!json) {
      return { ...fallback, generatedBy: "rules" };
    }

    return {
      ...normalizeBrief(JSON.parse(json), fallback, allowedReferences),
      generatedBy: "llm",
    };
  } catch {
    return { ...fallback, generatedBy: "rules" };
  }
}
