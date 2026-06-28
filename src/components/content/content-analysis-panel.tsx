"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { analyzeSeoContent } from "./content-analysis";

interface LocalQualityAnalysis {
  localMetrics: {
    readabilityScore: number;
    vocabularyDiversity: number;
    sentenceComplexity: number;
    consistencyScore: number;
  };
  overallScore: number;
  sentiment: {
    overall: "positive" | "neutral" | "negative";
    score: number;
    confidence: number;
  };
  structure: {
    hasH1: boolean;
    h1Count: number;
    headingHierarchy: string[];
    paragraphCount: number;
    averageParagraphLength: number;
    longParagraphs: number;
    structureScore: number;
  };
  keywords: Array<{ keyword: string; frequency?: number; relevance?: number }>;
  suggestions: string[];
}

interface AIQualityAnalysis {
  score?: number;
  qualityScore?: number;
  quality?: number;
  engagement?: number;
  brandVoice?: number;
  platformFit?: number;
  suggestions?: string[] | string | null;
}

interface OptimizationResult {
  original: string;
  optimized: string;
  diff?: string;
  applied?: boolean;
}

interface ContentAnalysisPanelProps {
  contentPieceId: string;
  projectId: string | null;
  content: string;
  platform?: string;
  onContentUpdate?: (newContent: string) => Promise<boolean>;
}

type TabType = "quality" | "seo";
type InsightTone = "success" | "warning" | "danger" | "info";
type AnalysisTone = InsightTone | "primary";

const TONE_COLOR: Record<AnalysisTone, string> = {
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-error)",
  info: "var(--color-info)",
};

function toneSurface(tone: AnalysisTone, strength = 10) {
  return `color-mix(in srgb, ${TONE_COLOR[tone]} ${strength}%, var(--bg-card))`;
}

function toneBorder(tone: AnalysisTone, strength = 30) {
  return `color-mix(in srgb, ${TONE_COLOR[tone]} ${strength}%, var(--border))`;
}

function semanticPanelStyle(tone: AnalysisTone, strength = 10): CSSProperties {
  return {
    background: toneSurface(tone, strength),
    borderColor: toneBorder(tone),
    color: "var(--text-primary)",
  };
}

export function buildContentAnalysisUrl(
  contentPieceId: string,
  endpoint: "quality" | "quality/local" | "optimize-seo",
  projectId: string,
  query: Record<string, string | undefined> = {},
) {
  const search = new URLSearchParams();
  search.set("projectId", projectId);
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" && value.length > 0) {
      search.set(key, value);
    }
  }
  return `/api/content/${contentPieceId}/${endpoint}?${search.toString()}`;
}

export function ContentAnalysisPanel({
  contentPieceId,
  projectId,
  content,
  platform = "wechat",
  onContentUpdate,
}: ContentAnalysisPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("quality");
  const [keyword, setKeyword] = useState("");
  const [localAnalysis, setLocalAnalysis] = useState<LocalQualityAnalysis | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [aiQuality, setAiQuality] = useState<AIQualityAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [seoLoading, setSeoLoading] = useState(false);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setLocalAnalysis(null);
    setAiQuality(null);
    setOptimization(null);
    setFeedback(null);
  }, [contentPieceId, platform, projectId]);

  const seoAnalysis = useMemo(() => analyzeSeoContent(content, keyword), [content, keyword]);

  const loadLocalAnalysis = useCallback(async () => {
    if (!projectId) {
      setFeedback({ tone: "error", text: "缺少项目上下文，无法加载分析" });
      return;
    }
    setLocalLoading(true);
    try {
      const res = await fetch(buildContentAnalysisUrl(contentPieceId, "quality/local", projectId, { platform }));
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "加载质量分析失败");
      }
      setLocalAnalysis((json?.data ?? json) as LocalQualityAnalysis);
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "加载质量分析失败" });
    } finally {
      setLocalLoading(false);
    }
  }, [contentPieceId, platform, projectId]);

  const loadAiQuality = useCallback(async () => {
    if (!projectId) {
      setFeedback({ tone: "error", text: "缺少项目上下文，无法生成 AI 质量分析" });
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch(buildContentAnalysisUrl(contentPieceId, "quality", projectId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, platform }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "生成 AI 质量分析失败");
      }
      setAiQuality((json?.data ?? json) as AIQualityAnalysis);
      setFeedback({ tone: "success", text: "AI 质量分析已生成" });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "生成 AI 质量分析失败" });
    } finally {
      setAiLoading(false);
    }
  }, [contentPieceId, platform, projectId]);

  const optimizeSeo = useCallback(async () => {
    if (!projectId) {
      setFeedback({ tone: "error", text: "缺少项目上下文，无法生成 SEO 优化" });
      return;
    }
    if (!content.trim()) {
      setFeedback({ tone: "error", text: "先填写内容，再做 SEO 优化" });
      return;
    }

    setSeoLoading(true);
    try {
      const res = await fetch(buildContentAnalysisUrl(contentPieceId, "optimize-seo", projectId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, content, keyword: keyword.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "生成 SEO 优化失败");
      }

      const data = json?.data ?? json ?? {};
      setOptimization({
        original: typeof data.original === "string" ? data.original : content,
        optimized: typeof data.optimized === "string"
          ? data.optimized
          : typeof data.content === "string"
            ? data.content
            : typeof data.result === "string"
              ? data.result
              : typeof data.text === "string"
                ? data.text
                : content,
        diff: typeof data.diff === "string" ? data.diff : undefined,
        applied: false,
      });
      setFeedback({ tone: "success", text: "SEO 优化建议已生成" });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "生成 SEO 优化失败" });
    } finally {
      setSeoLoading(false);
    }
  }, [content, contentPieceId, keyword, projectId]);

  const applyOptimization = useCallback(async () => {
    if (!optimization || !onContentUpdate) return;
    const success = await onContentUpdate(optimization.optimized);
    if (success) {
      setOptimization({ ...optimization, applied: true });
      setFeedback({ tone: "success", text: "优化结果已应用到编辑器" });
    }
  }, [onContentUpdate, optimization]);

  useEffect(() => {
    if (isOpen && !localAnalysis && !localLoading) {
      void loadLocalAnalysis();
    }
  }, [isOpen, localAnalysis, localLoading, loadLocalAnalysis]);

  const combinedQualityScore = aiQuality?.score ?? aiQuality?.qualityScore ?? aiQuality?.quality ?? localAnalysis?.overallScore ?? null;
  const seoScore = seoAnalysis.overallScore;
  const localSuggestions = localAnalysis?.suggestions ?? [];
  const aiSuggestions = useMemo(() => parseAiSuggestions(aiQuality?.suggestions), [aiQuality?.suggestions]);

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm ring-1 ring-black/5">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="w-full bg-[linear-gradient(180deg,rgba(14,165,233,0.06),rgba(14,165,233,0))] px-4 py-3 text-left transition-colors hover:bg-secondary/20 sm:px-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">内容分析</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  质量 / SEO
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-secondary)" }}>
                参考原智创项目的质量分析和 SEO 分析结构
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {combinedQualityScore != null && <ScoreBadge label="质量" value={combinedQualityScore} tone={getScoreTone(combinedQualityScore)} />}
            <ScoreBadge label="SEO" value={seoScore} tone={getScoreTone(seoScore)} />
            <div
              className="flex size-7 items-center justify-center rounded-full border"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              {isOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </div>
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border/80">
          <div className="flex gap-1 border-b border-border/60 px-3 py-2">
            <TabChip active={activeTab === "quality"} icon={Sparkles} label="质量分析" tone="violet" onClick={() => setActiveTab("quality")} />
            <TabChip active={activeTab === "seo"} icon={Search} label="SEO 分析" tone="sky" onClick={() => setActiveTab("seo")} />
          </div>

          <div className="px-4 py-4 sm:px-5">
            {feedback && (
              <div
                className="mb-3 rounded-md border px-3 py-2 text-xs"
                style={semanticPanelStyle(feedback.tone === "success" ? "success" : "danger", 12)}
              >
                {feedback.text}
              </div>
            )}

            {activeTab === "quality" && (
              <div className="space-y-3">
                <SectionDivider
                  icon={Sparkles}
                  title="本地质量分析"
                  right={
                    <button
                      type="button"
                      onClick={loadLocalAnalysis}
                      disabled={localLoading}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                    >
                      {localLoading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                      刷新
                    </button>
                  }
                />

                {localLoading ? (
                  <EmptyState icon={Loader2} title="正在分析质量" description="正在从后端加载可读性、结构和一致性指标。" spinning />
                ) : localAnalysis ? (
                  <>
                    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                      <MetricCard label="可读性" value={localAnalysis.localMetrics.readabilityScore} good={localAnalysis.localMetrics.readabilityScore >= 70} />
                      <MetricCard label="词汇多样性" value={`${Math.round(localAnalysis.localMetrics.vocabularyDiversity * 100)}%`} good={localAnalysis.localMetrics.vocabularyDiversity >= 0.35} />
                      <MetricCard label="句子复杂度" value={localAnalysis.localMetrics.sentenceComplexity.toFixed(1)} good={localAnalysis.localMetrics.sentenceComplexity <= 20} />
                      <MetricCard label="一致性" value={localAnalysis.localMetrics.consistencyScore} good={localAnalysis.localMetrics.consistencyScore >= 70} />
                    </div>

                    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                      <MetricCard label="结构评分" value={localAnalysis.structure.structureScore} good={localAnalysis.structure.structureScore >= 70} />
                      <MetricCard label="H1 数量" value={localAnalysis.structure.h1Count} good={localAnalysis.structure.h1Count === 1} />
                      <MetricCard label="段落数量" value={localAnalysis.structure.paragraphCount} good={localAnalysis.structure.paragraphCount >= 3} />
                      <MetricCard label="长段落" value={localAnalysis.structure.longParagraphs} good={localAnalysis.structure.longParagraphs === 0} />
                    </div>

                    <div className="grid gap-1.5 sm:grid-cols-3">
                      <InfoCard label="整体评分" value={localAnalysis.overallScore} tone={localAnalysis.overallScore >= 80 ? "success" : localAnalysis.overallScore >= 60 ? "warning" : "danger"} />
                      <InfoCard label="情绪倾向" value={localAnalysis.sentiment.overall} tone="info" />
                      <InfoCard label="置信度" value={`${Math.round(localAnalysis.sentiment.confidence * 100)}%`} tone="info" />
                    </div>

                    {localSuggestions.length > 0 && (
                      <section className="space-y-1.5">
                        <SectionDivider icon={Lightbulb} title="质量建议" />
                        <ul className="space-y-1">
                          {localSuggestions.map((item, index) => (
                            <SuggestionItem key={`${item}-${index}`} tone={index === 0 ? "warning" : "info"} text={item} />
                          ))}
                        </ul>
                      </section>
                    )}

                    <section className="space-y-1.5">
                      <SectionDivider
                        icon={Sparkles}
                        title="AI 质量结果"
                        right={
                          <button
                            type="button"
                            onClick={loadAiQuality}
                            disabled={aiLoading}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors"
                            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                          >
                            {aiLoading ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
                            生成
                          </button>
                        }
                      />

                      {aiQuality ? (
                        <div
                          className="space-y-2 rounded-lg border p-3"
                          style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                        >
                          <div className="grid gap-1.5 sm:grid-cols-3">
                            <InfoCard label="质量" value={pickQualityScore(aiQuality)} tone="success" />
                            <InfoCard label="参与度" value={aiQuality.engagement ?? "—"} tone="info" />
                            <InfoCard label="平台适配" value={aiQuality.platformFit ?? "—"} tone="info" />
                          </div>
                          {aiSuggestions.length > 0 && (
                            <ul className="space-y-1">
                              {aiSuggestions.map((item, index) => (
                                <SuggestionItem key={`${item}-${index}`} tone="info" text={item} />
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <EmptyState icon={Sparkles} title="还没有 AI 质量分析" description="点击「生成」后，后端会返回质量评分和建议。" />
                      )}
                    </section>
                  </>
                ) : (
                  <EmptyState icon={AlertCircle} title="暂无质量分析" description="点击「刷新」获取后端本地质量分析。" />
                )}
              </div>
            )}

            {activeTab === "seo" && (
              <div className="space-y-3">
                <SectionDivider icon={Search} title="SEO 指标" />

                <label className="block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  目标关键词
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="输入要优化的关键词"
                    className="mt-1 w-full rounded-md border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  />
                </label>

                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard label="字符数" value={seoAnalysis.characterCount} good={seoAnalysis.characterCount >= 300 && seoAnalysis.characterCount <= 3000} />
                  <MetricCard label="词数" value={seoAnalysis.wordCount} good={seoAnalysis.wordCount >= 50} />
                  <MetricCard label="标题层级" value={seoAnalysis.headingCount} good={seoAnalysis.headingCount >= 2 && seoAnalysis.validHierarchy} />
                  <MetricCard label="H1" value={seoAnalysis.hasH1 ? "有" : "缺"} good={seoAnalysis.hasH1} />
                </div>

                {keyword.trim() && seoAnalysis.keywordDensity[0] && (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <MetricCard
                      label="关键词密度"
                      value={`${seoAnalysis.keywordDensity[0].density.toFixed(1)}%`}
                      good={seoAnalysis.keywordDensity[0].rating === "good"}
                    />
                    <MetricCard label="标题含关键词" value={seoAnalysis.keywordInTitle ? "是" : "否"} good={seoAnalysis.keywordInTitle} />
                  </div>
                )}

                <div className="grid gap-1.5 sm:grid-cols-2">
                  <MetricCard label="开头含关键词" value={seoAnalysis.keywordInOpening ? "是" : "否"} good={seoAnalysis.keywordInOpening} />
                  <MetricCard label="结构合法" value={seoAnalysis.validHierarchy ? "是" : "否"} good={seoAnalysis.validHierarchy} />
                </div>

                <section className="space-y-1.5">
                  <SectionDivider icon={Lightbulb} title="SEO 建议" />
                  <ul className="space-y-1">
                    {seoAnalysis.suggestions.map((item, index) => (
                      <SuggestionItem key={`${item}-${index}`} tone={index === 0 && seoAnalysis.suggestions.length === 1 ? "success" : "warning"} text={item} />
                    ))}
                  </ul>
                </section>

                <section className="space-y-1.5">
                  <SectionDivider
                    icon={Wand2}
                    title="SEO 优化"
                    right={
                      <button
                        type="button"
                        onClick={optimizeSeo}
                        disabled={seoLoading}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                      >
                        {seoLoading ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
                        生成优化
                      </button>
                    }
                  />
                  <p className="px-1 text-[11px] leading-5" style={{ color: "var(--text-secondary)" }}>
                    这会基于当前内容和关键词给出一版可直接替换的 SEO 优化结果。
                  </p>
                </section>
              </div>
            )}
          </div>

          {optimization && (
            <div
              className="border-t px-4 py-3 sm:px-5"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className="flex size-7 items-center justify-center rounded-lg"
                    style={semanticPanelStyle("info", 14)}
                  >
                    <Search className="size-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-foreground">SEO 优化结果</h4>
                  </div>
                </div>
                {!optimization.applied ? (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={applyOptimization}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-white"
                    >
                      <Check className="size-3" />
                      应用
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptimization(null)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                    >
                      <X className="size-3" />
                      关闭
                    </button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--color-success)" }}>
                    <CheckCircle2 className="size-3.5" />
                    已应用
                  </span>
                )}
              </div>
              {optimization.diff && (
                <pre
                  className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg p-2.5 text-xs leading-5"
                  style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}
                >
                  {optimization.diff}
                </pre>
              )}
              <details className="group mt-2">
                <summary className="cursor-pointer text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  查看完整对比
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <PreviewCard title="原始内容" accent="red" content={optimization.original} />
                  <PreviewCard title="优化后内容" accent="green" content={optimization.optimized} />
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function parseAiSuggestions(value: AIQualityAnalysis["suggestions"]) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  if (typeof value === "string") return [value];
  return [];
}

function pickQualityScore(value: AIQualityAnalysis) {
  const raw = value.score ?? value.qualityScore ?? value.quality;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : "—";
}

function getScoreTone(score: number): InsightTone {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "danger";
}

function ScoreBadge({ label, value, tone }: { label: string; value: number | string; tone: InsightTone }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
      style={semanticPanelStyle(tone, 8)}
    >
      <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="text-xs font-bold tabular-nums" style={{ color: TONE_COLOR[tone] }}>{value}</span>
    </div>
  );
}

function TabChip({
  active,
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  tone: "violet" | "sky";
  onClick: () => void;
}) {
  const activeTone = tone === "violet" ? "primary" : "info";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
      style={active
        ? {
            ...semanticPanelStyle(activeTone, 12),
            boxShadow: `inset 0 0 0 1px ${toneBorder(activeTone, 36)}`,
          }
        : {
            color: "var(--text-secondary)",
          }}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function SectionDivider({
  icon: Icon,
  title,
  right,
}: {
  icon: LucideIcon;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-3" style={{ color: "var(--text-secondary)" }} />
      <span className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--text-secondary)" }}>{title}</span>
      <div className="h-px flex-1" style={{ background: "var(--border)" }} />
      {right}
    </div>
  );
}

function MetricCard({
  label,
  value,
  good,
}: {
  label: string;
  value: number | string;
  good: boolean;
}) {
  const tone: InsightTone = good ? "success" : "warning";
  return (
    <div className="flex items-center justify-between rounded-md border px-2 py-1" style={semanticPanelStyle(tone, 8)}>
      <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="text-xs font-semibold tabular-nums" style={{ color: TONE_COLOR[tone] }}>{value}</span>
    </div>
  );
}

function InfoCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-2 py-1" style={semanticPanelStyle(tone, 8)}>
      <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="text-xs font-semibold tabular-nums" style={{ color: TONE_COLOR[tone] }}>{value}</span>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  spinning,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  spinning?: boolean;
}) {
  return (
    <div
      className="rounded-lg border border-dashed px-4 py-6 text-center"
      style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
    >
      <div
        className="mx-auto flex size-8 items-center justify-center rounded-full ring-1"
        style={{ background: "var(--bg-card)", color: "var(--text-secondary)", boxShadow: "inset 0 0 0 1px var(--border)" }}
      >
        <Icon className={`size-3.5 ${spinning ? "animate-spin" : ""}`} />
      </div>
      <h4 className="mt-2 text-xs font-medium text-foreground">{title}</h4>
      <p className="mx-auto mt-1 max-w-sm text-[11px] leading-5" style={{ color: "var(--text-secondary)" }}>{description}</p>
    </div>
  );
}

function SuggestionItem({ tone, text }: { tone: InsightTone; text: string }) {
  return (
    <li
      className="flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs leading-5"
      style={{
        background: "var(--bg-elevated)",
        borderColor: "var(--border)",
        color: "var(--text-secondary)",
      }}
    >
      <SuggestionIcon tone={tone} />
      <span>{text}</span>
    </li>
  );
}

function SuggestionIcon({ tone }: { tone: InsightTone }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Lightbulb : AlertCircle;
  return <Icon className="mt-0.5 size-3 shrink-0" style={{ color: TONE_COLOR[tone] }} />;
}

function PreviewCard({
  title,
  accent,
  content,
}: {
  title: string;
  accent: "red" | "green";
  content: string;
}) {
  const tone: InsightTone = accent === "red" ? "danger" : "success";
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium" style={{ color: "var(--text-secondary)" }}>{title}</div>
      <div
        className="whitespace-pre-wrap rounded-md border p-2 text-[11px] leading-5"
        style={{
          ...semanticPanelStyle(tone, 7),
          color: "var(--text-secondary)",
        }}
      >
        {content.slice(0, 300)}
        {content.length > 300 ? "..." : ""}
      </div>
    </div>
  );
}
