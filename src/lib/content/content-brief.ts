export interface SuggestionForContentBrief {
  id?: string;
  text: string;
  description?: string;
  platform?: string;
  priority?: string;
  evidence_summary?: string;
  audit_findings?: string[];
  success_metric?: string;
  acceptance_criteria?: string[];
  measurement_plan?: string;
  evidence_sources?: string[];
  evidence_channels?: string[];
  action_sources?: string[];
  action_channels?: string[];
  action_type?: string;
  type_tags?: string[];
  keywords?: string[];
  content_outline?: string;
  weekly_tasks?: { week: string; tasks: string[] }[];
  competitor_reference?: string;
  expected_result?: string;
}

export interface ContentBrief {
  topic: string;
  keyPoints: string[];
  references: string;
  notes: string;
  platforms: string[];
  contentType?: string;
  intent?: string;
  titleCandidates?: string[];
  mustMention?: string[];
  avoid?: string[];
}

export interface ContentBriefProjectContext {
  name?: string | null;
  industry?: string | null;
  productName?: string | null;
  productKeywords?: string[];
  productDescription?: string | null;
}

const SUPPORTED_PLATFORMS = new Set(["wechat", "weibo", "douyin", "xiaohongshu", "toutiao", "zhihu"]);

const CHANNEL_TO_PLATFORM: Record<string, string> = {
  wechat: "wechat",
  "微信": "wechat",
  "微信公众号": "wechat",
  weibo: "weibo",
  "微博": "weibo",
  douyin: "douyin",
  "抖音": "douyin",
  xiaohongshu: "xiaohongshu",
  "小红书": "xiaohongshu",
  toutiao: "toutiao",
  "今日头条": "toutiao",
  zhihu: "zhihu",
  "知乎": "zhihu",
};

function cleanText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function shortPhrase(value?: string | null, limit = 36) {
  const firstSentence = cleanText(value).split(/[。！？.!?；;]/)[0]?.trim() ?? "";
  return firstSentence.length > limit ? `${firstSentence.slice(0, limit)}…` : firstSentence;
}

function unique(values: string[], limit?: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = cleanText(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (limit && result.length >= limit) break;
  }
  return result;
}

function normalizeUrl(value: string) {
  const trimmed = cleanText(value);
  if (!trimmed) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isSpecificReferenceUrl(value: string) {
  const normalized = normalizeUrl(value);
  if (!normalized) return false;
  const url = new URL(normalized);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const hasContentPathHint = /\/(articles?|blogs?|posts?|news|docs?|guides?|cases?|learn|resources?|questions?|knowledge|insights?)\b/i.test(url.pathname);
  return pathParts.length >= 2 || hasContentPathHint;
}

export function filterSpecificReferenceUrls(values: string[], limit = 5) {
  return unique(values.map(normalizeUrl).filter(isSpecificReferenceUrl), limit);
}

function detectPlatforms(suggestion: SuggestionForContentBrief) {
  const rawChannels = [
    ...(suggestion.action_channels ?? []),
    ...(suggestion.evidence_channels ?? []),
    suggestion.platform ?? "",
  ];

  return unique(
    rawChannels
      .map((channel) => CHANNEL_TO_PLATFORM[channel.toLowerCase?.() ?? channel] ?? CHANNEL_TO_PLATFORM[channel] ?? "")
      .filter((platform) => SUPPORTED_PLATFORMS.has(platform)),
  );
}

function editorialTopic(suggestion: SuggestionForContentBrief, project?: ContentBriefProjectContext) {
  const brand = cleanText(project?.name) || cleanText(project?.productName) || "品牌";
  const product = cleanText(project?.productName);
  const keywords = unique(project?.productKeywords?.length ? project.productKeywords : suggestion.keywords ?? [], 2);
  const signal = [suggestion.text, suggestion.description, suggestion.action_type, ...(suggestion.type_tags ?? [])]
    .map(cleanText)
    .join(" ")
    .toLowerCase();
  const keywordLabel = keywords.join("与");

  if (/百科|词条|encyclop/.test(signal)) {
    const positioning = shortPhrase(project?.productDescription);
    return positioning
      ? `${brand}是什么？${positioning}的定位、核心能力与应用场景`
      : `${brand}是什么？品牌定位、核心能力与应用场景`;
  }
  if (/faq|问答|常见问题/.test(signal)) {
    return `${brand}${product && product !== brand ? `（${product}）` : ""}常见问题：${keywordLabel || "核心能力"}的理解与应用`;
  }
  if (/对比|比较|选型|comparison/.test(signal)) {
    return `${keywordLabel || product || brand}选型指南：关键能力、适用场景与评估方法`;
  }
  if (/引用|推荐|可见性|citation|visibility/.test(signal)) {
    return `${brand}如何通过${keywordLabel || "高质量内容"}提升品牌可见性与可信度`;
  }
  return `${brand}${product && product !== brand ? `（${product}）` : ""}：核心价值、适用场景与实践方法`;
}

function editorialKeyPoints(suggestion: SuggestionForContentBrief, project?: ContentBriefProjectContext) {
  const brand = cleanText(project?.name) || cleanText(project?.productName) || "品牌/产品";
  const product = cleanText(project?.productName);
  const industry = cleanText(project?.industry);
  const description = cleanText(project?.productDescription);
  const keywords = unique(project?.productKeywords?.length ? project.productKeywords : suggestion.keywords ?? [], 3);
  const keywordLabel = keywords.join("、");

  return unique([
    `先回答读者最关心的问题：${brand}${product && product !== brand ? `与${product}` : ""}是什么、解决什么问题`,
    industry ? `说明${industry}场景下的典型痛点，以及为什么需要关注${keywordLabel || "这一能力"}` : `说明目标用户面临的典型问题，以及为什么需要关注${keywordLabel || "这一能力"}`,
    description ? `基于已确认信息拆解核心定位与能力：${description}` : `拆解核心能力、工作方式和适用边界，避免空泛宣传`,
    `用具体使用场景说明${brand}能为用户带来的价值，不虚构案例或效果数据`,
    `围绕${keywordLabel || "产品与行业主题"}回答常见疑问，并给出清晰、可执行的理解路径`,
    `总结选择或评估相关方案时应关注的指标、证据和下一步行动`,
  ], 8);
}

export function createContentBriefFromSuggestion(
  suggestion: SuggestionForContentBrief,
  project?: ContentBriefProjectContext,
): ContentBrief {
  const keywords = unique(suggestion.keywords ?? [], 3);
  const topic = editorialTopic(suggestion, project);
  const keyPoints = editorialKeyPoints(suggestion, project);

  const referenceLines = filterSpecificReferenceUrls([...(suggestion.action_sources ?? []), ...(suggestion.evidence_sources ?? [])]);

  const noteLines = unique([
    `创作目的：将内部优化建议转化为面向目标读者的独立内容，不在正文中复述任务或审计话术。`,
    suggestion.expected_result ? `期望影响：${cleanText(suggestion.expected_result)}` : "",
    suggestion.success_metric ? `发布后观察：${cleanText(suggestion.success_metric)}` : "",
    keywords.length > 0 ? `自然融入关键词：${keywords.join("、")}，避免堆砌。` : "",
    `事实要求：只使用已确认的项目、产品与参考资料；缺少证据的案例、数据和结论不得编造。`,
  ]);

  return {
    topic,
    keyPoints,
    references: referenceLines.join("\n"),
    notes: noteLines.join("\n"),
    platforms: detectPlatforms(suggestion),
  };
}

export function contentBriefToSearchParams(brief: ContentBrief) {
  const params = new URLSearchParams();
  if (brief.topic) params.set("topic", brief.topic);
  if (brief.keyPoints.length > 0) params.set("keyPoints", JSON.stringify(brief.keyPoints));
  if (brief.references) params.set("references", brief.references);
  if (brief.notes) params.set("notes", brief.notes);
  if (brief.platforms.length > 0) params.set("platforms", brief.platforms.join(","));
  return params;
}

export function parseContentBriefSearchParams(searchParams: URLSearchParams) {
  const keyPointsParam = searchParams.get("keyPoints");
  let keyPoints: string[] = [];
  if (keyPointsParam) {
    try {
      const parsed = JSON.parse(keyPointsParam);
      if (Array.isArray(parsed)) {
        keyPoints = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      }
    } catch {
      keyPoints = [];
    }
  }

  const platforms = unique(
    (searchParams.get("platforms") ?? "")
      .split(",")
      .map((platform) => platform.trim())
      .filter((platform) => SUPPORTED_PLATFORMS.has(platform)),
  );

  return {
    topic: searchParams.get("topic") ?? "",
    keyPoints: keyPoints.length > 0 ? keyPoints : [""],
    references: searchParams.get("references") ?? "",
    notes: searchParams.get("notes") ?? "",
    platforms,
  };
}
