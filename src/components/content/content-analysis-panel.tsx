"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  content: string;
  platform?: string;
  onContentUpdate?: (newContent: string) => Promise<boolean>;
}

type TabType = "quality" | "seo";
type InsightTone = "success" | "warning" | "danger" | "info";

export function ContentAnalysisPanel({
  contentPieceId,
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
  }, [contentPieceId, platform]);

  const seoAnalysis = useMemo(() => analyzeSeoContent(content, keyword), [content, keyword]);

  const loadLocalAnalysis = useCallback(async () => {
    setLocalLoading(true);
    try {
      const res = await fetch(`/api/content/${contentPieceId}/quality/local?platform=${encodeURIComponent(platform)}`);
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
  }, [contentPieceId, platform]);

  const loadAiQuality = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/content/${contentPieceId}/quality`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
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
  }, [contentPieceId, platform]);

  const optimizeSeo = useCallback(async () => {
    if (!content.trim()) {
      setFeedback({ tone: "error", text: "先填写内容，再做 SEO 优化" });
      return;
    }

    setSeoLoading(true);
    try {
      const res = await fetch(`/api/content/${contentPieceId}/optimize-seo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, keyword: keyword.trim() }),
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
  }, [content, contentPieceId, keyword]);

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
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                参考原智创项目的质量分析和 SEO 分析结构
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {combinedQualityScore != null && <ScoreBadge label="质量" value={combinedQualityScore} color={getScoreColor(combinedQualityScore)} />}
            <ScoreBadge label="SEO" value={seoScore} color={getScoreColor(seoScore)} />
            <div className="flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground">
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
                className={`mb-3 rounded-md border px-3 py-2 text-xs ${
                  feedback.tone === "success"
                    ? "border-emerald-200/60 bg-emerald-50/50 text-emerald-700"
                    : "border-red-200/60 bg-red-50/50 text-red-700"
                }`}
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
                      className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40"
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
                            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40"
                          >
                            {aiLoading ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
                            生成
                          </button>
                        }
                      />

                      {aiQuality ? (
                        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
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

                <label className="block text-xs font-medium text-muted-foreground">
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
                        className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed"
                      >
                        {seoLoading ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
                        生成优化
                      </button>
                    }
                  />
                  <p className="px-1 text-[11px] leading-5 text-muted-foreground">
                    这会基于当前内容和关键词给出一版可直接替换的 SEO 优化结果。
                  </p>
                </section>
              </div>
            )}
          </div>

          {optimization && (
            <div className="border-t border-border/80 bg-muted/30 px-4 py-3 sm:px-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
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
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 px-2.5 text-xs font-medium text-muted-foreground"
                    >
                      <X className="size-3" />
                      关闭
                    </button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                    <CheckCircle2 className="size-3.5" />
                    已应用
                  </span>
                )}
              </div>
              {optimization.diff && (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-2.5 text-xs leading-5 text-muted-foreground">
                  {optimization.diff}
                </pre>
              )}
              <details className="group mt-2">
                <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
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

function getScoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function ScoreBadge({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2 py-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-xs font-bold tabular-nums ${color}`}>{value}</span>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? tone === "violet"
            ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200/60"
            : "bg-sky-50 text-sky-700 ring-1 ring-sky-200/60"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      }`}
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
      <Icon className="size-3 text-muted-foreground/60" />
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground/80">{title}</span>
      <div className="h-px flex-1 bg-border/40" />
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
  return (
    <div className={`flex items-center justify-between rounded-md border px-2 py-1 ${good ? "border-emerald-200/50 bg-emerald-50/30" : "border-amber-200/50 bg-amber-50/30"}`}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${good ? "text-emerald-700" : "text-amber-700"}`}>{value}</span>
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
  const toneClass = {
    success: "border-emerald-200/50 bg-emerald-50/30 text-emerald-700",
    warning: "border-amber-200/50 bg-amber-50/30 text-amber-700",
    danger: "border-red-200/50 bg-red-50/30 text-red-700",
    info: "border-sky-200/50 bg-sky-50/30 text-sky-700",
  }[tone];

  return (
    <div className={`flex items-center justify-between rounded-md border px-2 py-1 ${toneClass}`}>
      <span className="text-[11px] opacity-80">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{value}</span>
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
    <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center">
      <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
        <Icon className={`size-3.5 ${spinning ? "animate-spin" : ""}`} />
      </div>
      <h4 className="mt-2 text-xs font-medium text-foreground">{title}</h4>
      <p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function SuggestionItem({ tone, text }: { tone: InsightTone; text: string }) {
  return (
    <li className="flex items-start gap-2 rounded-md bg-muted/30 px-2.5 py-1.5 text-xs leading-5 text-muted-foreground">
      <SuggestionIcon tone={tone} />
      <span>{text}</span>
    </li>
  );
}

function SuggestionIcon({ tone }: { tone: InsightTone }) {
  if (tone === "success") return <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600" />;
  if (tone === "danger") return <AlertCircle className="mt-0.5 size-3 shrink-0 text-red-600" />;
  if (tone === "warning") return <AlertCircle className="mt-0.5 size-3 shrink-0 text-amber-600" />;
  return <Lightbulb className="mt-0.5 size-3 shrink-0 text-sky-600" />;
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
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium text-muted-foreground">{title}</div>
      <div className={`whitespace-pre-wrap rounded-md border p-2 text-[11px] leading-5 text-muted-foreground ${accent === "red" ? "border-red-100 bg-red-50/60" : "border-green-100 bg-green-50/60"}`}>
        {content.slice(0, 300)}
        {content.length > 300 ? "..." : ""}
      </div>
    </div>
  );
}
