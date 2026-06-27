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

function outlineItems(outline?: string) {
  return (outline ?? "")
    .split(/\r?\n|[;；]/)
    .map((item) => item.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean);
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

export function createContentBriefFromSuggestion(suggestion: SuggestionForContentBrief): ContentBrief {
  const keywords = unique(suggestion.keywords ?? [], 3);
  const topicParts = [
    cleanText(suggestion.action_type),
    keywords.length > 0 ? keywords.join(" / ") : "",
    cleanText(suggestion.text),
  ].filter(Boolean);
  const topic = topicParts.length > 0 ? topicParts.slice(0, 2).join("：") : cleanText(suggestion.text);

  const weeklyTasks = (suggestion.weekly_tasks ?? []).flatMap((week) => week.tasks);
  const keyPoints = unique(
    [
      ...outlineItems(suggestion.content_outline),
      ...(suggestion.audit_findings ?? []),
      ...(suggestion.acceptance_criteria ?? []),
      ...weeklyTasks,
      suggestion.expected_result ?? "",
      suggestion.success_metric ?? "",
      suggestion.competitor_reference ?? "",
      ...keywords.map((keyword) => `覆盖关键词：${keyword}`),
    ],
    8,
  );

  const referenceLines = unique([...(suggestion.action_sources ?? []), ...(suggestion.evidence_sources ?? [])]);

  const noteLines = unique([
    suggestion.description ?? "",
    suggestion.evidence_summary ? `审计依据：${suggestion.evidence_summary}` : "",
    suggestion.action_type ? `建议动作：${suggestion.action_type}` : "",
    suggestion.expected_result ? `预期结果：${suggestion.expected_result}` : "",
    suggestion.success_metric ? `成功指标：${suggestion.success_metric}` : "",
    suggestion.measurement_plan ? `复盘方式：${suggestion.measurement_plan}` : "",
    suggestion.platform ? `来源平台：${suggestion.platform}` : "",
    suggestion.text ? `原始建议：${suggestion.text}` : "",
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
