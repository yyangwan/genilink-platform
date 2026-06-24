export interface SeoKeywordMetric {
  keyword: string;
  count: number;
  density: number;
  rating: "good" | "low" | "stuffed";
}

export interface SeoAnalysisResult {
  characterCount: number;
  wordCount: number;
  keywordDensity: SeoKeywordMetric[];
  overallScore: number;
  keywordInTitle: boolean;
  keywordInOpening: boolean;
  hasH1: boolean;
  headingCount: number;
  validHierarchy: boolean;
  suggestions: string[];
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getHeadingLevels(html: string) {
  const matches = [...html.matchAll(/<h([1-6])[^>]*>/gi)];
  return matches.map((match) => Number.parseInt(match[1] ?? "1", 10));
}

export function analyzeSeoContent(content: string, keyword: string): SeoAnalysisResult {
  const textContent = stripHtml(content);
  const characterCount = textContent.length;
  const words = textContent.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const keywordTrimmed = keyword.trim().toLowerCase();
  const keywordDensity: SeoKeywordMetric[] = [];

  if (keywordTrimmed) {
    const matches = textContent.toLowerCase().match(new RegExp(escapeRegExp(keywordTrimmed), "g"))?.length ?? 0;
    const density = wordCount > 0 ? (matches / wordCount) * 100 : 0;
    let rating: SeoKeywordMetric["rating"] = "good";
    if (density < 2) rating = "low";
    else if (density > 5) rating = "stuffed";

    keywordDensity.push({
      keyword: keyword.trim(),
      count: matches,
      density,
      rating,
    });
  }

  const hasH1 = /<h1[^>]*>/i.test(content);
  const headingLevels = getHeadingLevels(content);
  const headingCount = headingLevels.length;
  let validHierarchy = true;
  for (let i = 1; i < headingLevels.length; i += 1) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) {
      validHierarchy = false;
      break;
    }
  }

  const firstHeading = content.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i)?.[1] ?? "";
  const keywordInTitle = keywordTrimmed
    ? Boolean(firstHeading) && stripHtml(firstHeading).toLowerCase().includes(keywordTrimmed)
    : true;
  const keywordInOpening = keywordTrimmed
    ? textContent.slice(0, 200).toLowerCase().includes(keywordTrimmed)
    : true;

  const suggestions: string[] = [];
  if (characterCount === 0) {
    suggestions.push("内容为空，先补充正文再看 SEO 指标。");
  } else if (characterCount < 300) {
    suggestions.push(`内容偏短（${characterCount} 字），建议扩展到 300 字以上。`);
  } else if (characterCount > 3000) {
    suggestions.push(`内容偏长（${characterCount} 字），建议拆分段落或精简表达。`);
  }

  if (keywordDensity[0]?.rating === "low") {
    suggestions.push(`关键词 "${keywordDensity[0].keyword}" 密度偏低（${keywordDensity[0].density.toFixed(1)}%），可以适当增加。`);
  }
  if (keywordDensity[0]?.rating === "stuffed") {
    suggestions.push(`关键词 "${keywordDensity[0].keyword}" 密度过高（${keywordDensity[0].density.toFixed(1)}%），建议降频。`);
  }

  if (!hasH1) suggestions.push("缺少 H1 标题，建议补一个明确的主题标题。");
  if (keywordTrimmed && !keywordInTitle) suggestions.push("关键词没有出现在标题里，建议把核心词放进标题。");
  if (keywordTrimmed && !keywordInOpening) suggestions.push("关键词没有出现在开头，建议在前 200 字自然引入。");
  if (headingCount > 1 && !validHierarchy) suggestions.push("标题层级跳跃，建议按 H1 -> H2 -> H3 递进。");
  if (headingCount === 0) suggestions.push("内容缺少标题结构，建议用小标题拆分段落。");

  if (suggestions.length === 0) {
    suggestions.push("当前 SEO 结构较完整，可以继续围绕核心关键词微调。");
  }

  let score = 0;
  if (characterCount > 0) score += 15;
  if (characterCount >= 300 && characterCount <= 3000) score += 20;
  else if (characterCount >= 120) score += 10;
  if (wordCount >= 50) score += 10;
  else if (wordCount >= 20) score += 5;

  if (keywordDensity.length > 0) {
    if (keywordDensity[0].rating === "good") score += 20;
    else if (keywordDensity[0].rating === "low") score += 10;
    else score += 5;
  } else {
    score += 12;
  }

  if (keywordInOpening) score += 10;
  if (keywordInTitle) score += 10;
  if (hasH1) score += 10;
  if (headingCount >= 2) score += 5;
  if (validHierarchy && headingCount >= 2) score += 5;

  return {
    characterCount,
    wordCount,
    keywordDensity,
    overallScore: Math.min(100, score),
    keywordInTitle,
    keywordInOpening,
    hasH1,
    headingCount,
    validHierarchy,
    suggestions,
  };
}
