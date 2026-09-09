"use client";

/**
 * 新建内容页（设计 §16.2）：
 * - ?briefId=... 从持久化 Brief 加载（URL 只含不透明 ID，不再携带业务正文）；
 * - 展示创作主题/结构/关键词/约束/平台能力/AI 提炼状态/来源建议；
 * - AI 提炼按 2s/3s/5s 退避轮询，总时长不超过 15 秒；
 * - 编辑通过 PATCH + expectedRevision 乐观锁提交（409 提示刷新）；
 * - 全局项目与 Brief 项目不一致时停止编辑。
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Sparkles, LayoutTemplate, Mic, Save } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useProject } from "@/components/project/project-context";
import { useToast } from "@/components/ui/toast-context";
import { BriefEditor, type BriefEditorValue } from "@/components/content/brief-editor";
import {
  PlatformCapabilitySelect,
  type PlatformPlanEntry,
} from "@/components/content/platform-capability-select";

interface TemplateOption {
  id: string;
  name: string;
  category?: string;
}

interface BrandVoiceOption {
  id: string;
  name: string;
  toneKeywords?: string[];
}

interface BriefDetail {
  id: string;
  projectId: string;
  revision: number;
  status: string;
  brief: {
    topic: string;
    titleCandidates: string[];
    outline: Array<{ id: string; heading: string; purpose: string; evidenceRefs: string[] }>;
    keywords: string[];
    references: Array<{ id: string; url: string; label?: string; source: string }>;
    notes: string;
    strategy: { objective: string; audience?: string; intent: string; contentType: string };
    constraints: {
      locked: { mustMention: string[]; avoidMention: string[] };
      editable: { mustMention: string[]; avoidMention: string[] };
    };
  } | null;
  platformPlan: PlatformPlanEntry[];
  source: { suggestionId: string };
  refinement: { status: string; attempts?: number; lastError?: string };
  eligibility: { requiresConfirmation: boolean; ruleId: string } | null;
}

const REFINEMENT_POLL_SCHEDULE_MS = [2000, 3000, 5000];
const REFINEMENT_POLL_MAX_MS = 15_000;

function emptyEditorValue(): BriefEditorValue {
  return {
    topic: "",
    titleCandidates: [],
    outline: Array.from({ length: 4 }, (_, i) => ({
      id: `section_${i + 1}`,
      heading: "",
      purpose: "",
      evidenceRefs: [],
    })),
    keywords: [],
    references: [],
    notes: "",
    mustMention: [],
    avoidMention: [],
  };
}

function editorValueFromBrief(detail: BriefDetail): BriefEditorValue {
  const brief = detail.brief;
  if (!brief) return emptyEditorValue();
  return {
    topic: brief.topic,
    titleCandidates: brief.titleCandidates,
    outline:
      brief.outline.length >= 4
        ? brief.outline
        : [
            ...brief.outline,
            ...Array.from({ length: 4 - brief.outline.length }, (_, i) => ({
              id: `section_extra_${i + 1}`,
              heading: "",
              purpose: "",
              evidenceRefs: [],
            })),
          ],
    keywords: brief.keywords,
    references: brief.references,
    notes: brief.notes ?? "",
    mustMention: [
      ...brief.constraints.locked.mustMention,
      ...brief.constraints.editable.mustMention,
    ],
    avoidMention: [
      ...brief.constraints.locked.avoidMention,
      ...brief.constraints.editable.avoidMention,
    ],
  };
}

function NewContentInner() {
  const { currentProjectId } = useProject();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addToast } = useToast();
  const briefId = searchParams.get("briefId") ?? "";

  const [editorValue, setEditorValue] = useState<BriefEditorValue>(emptyEditorValue);
  const [detail, setDetail] = useState<BriefDetail | null>(null);
  const [platformPlan, setPlatformPlan] = useState<PlatformPlanEntry[]>([]);
  const [loading, setLoading] = useState(Boolean(briefId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refinementStatus, setRefinementStatus] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [voices, setVoices] = useState<BrandVoiceOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");

  const applyDetail = useCallback((next: BriefDetail, force: boolean) => {
    setDetail(next);
    setRefinementStatus(next.refinement.status);
    if (force || !dirtyRef.current) {
      setEditorValue(editorValueFromBrief(next));
      setPlatformPlan(next.platformPlan);
    }
  }, []);

  // 加载 Brief（loading 初始值已按 briefId 置位；状态只在异步回调中更新）
  useEffect(() => {
    if (!briefId || !currentProjectId) return;
    let cancelled = false;
    fetch(`/api/content/briefs/${encodeURIComponent(briefId)}?projectId=${currentProjectId}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(json?.error?.message ?? "创作方案加载失败");
          }
          return;
        }
        if (!cancelled) {
          const next = json.data as BriefDetail;
          applyDetail(next, true);
          addToast({
            type: "info",
            title: "已生成基础创作方案",
            description: next.eligibility?.requiresConfirmation
              ? "请确认内容方向后继续。"
              : "你可以直接完善并开始创作。",
            duration: 5000,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("网络错误，无法加载创作方案");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [briefId, currentProjectId, applyDetail, addToast]);

  // AI 提炼状态轮询：2s/3s/5s 退避，总时长 ≤ 15s（设计 §7.2）。
  useEffect(() => {
    if (!briefId || !currentProjectId || loading) return;
    if (refinementStatus !== "queued" && refinementStatus !== "running") return;

    let cancelled = false;
    let attempt = 0;
    let elapsed = 0;
    let timer: ReturnType<typeof setTimeout>;

    const poll = () => {
      if (cancelled || attempt >= REFINEMENT_POLL_SCHEDULE_MS.length) return;
      const delay = REFINEMENT_POLL_SCHEDULE_MS[attempt];
      elapsed += delay;
      if (elapsed > REFINEMENT_POLL_MAX_MS) return;
      timer = setTimeout(async () => {
        if (cancelled) return;
        attempt += 1;
        try {
          const res = await fetch(
            `/api/content/briefs/${encodeURIComponent(briefId)}?projectId=${currentProjectId}`,
          );
          if (res.ok) {
            const json = await res.json();
            const next = json.data as BriefDetail;
            if (next.refinement.status !== "queued" && next.refinement.status !== "running") {
              applyDetail(next, false);
              if (next.refinement.status === "succeeded") {
                addToast({
                  type: "success",
                  title: "创作方案已根据建议完成提炼",
                  description: dirtyRef.current ? "保存前可刷新查看最新结果。" : undefined,
                });
              } else {
                addToast({
                  type: "info",
                  title: "已保留可用的基础创作方案",
                  description: "你可以继续编辑。",
                });
              }
              return;
            }
            setRefinementStatus(next.refinement.status);
          }
        } catch {
          // 轮询失败静默停止/重试
        }
        poll();
      }, delay);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [briefId, currentProjectId, loading, refinementStatus, applyDetail, addToast]);

  // 模板与品牌声音
  useEffect(() => {
    if (!currentProjectId) return;
    Promise.all([
      fetch(`/api/templates?projectId=${currentProjectId}`).then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
      fetch(`/api/brand-voices?projectId=${currentProjectId}`).then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]).then(([tmpl, voiceData]) => {
      setTemplates(tmpl.data ?? []);
      setVoices(voiceData.data ?? []);
    });
  }, [currentProjectId]);

  // 项目切换守卫（设计 §16.2）：Brief 属于其他项目时停止编辑（纯派生值）。
  const projectMismatch = Boolean(detail && currentProjectId && detail.projectId !== currentProjectId);

  const selectedPlatforms = useMemo(
    () => platformPlan.filter((p) => p.selected && p.capability === "supported").map((p) => p.platform),
    [platformPlan],
  );

  const handleEditorChange = useCallback((next: BriefEditorValue) => {
    dirtyRef.current = true;
    setDirty(true);
    setEditorValue(next);
  }, []);

  const togglePlatform = useCallback((platform: string) => {
    dirtyRef.current = true;
    setDirty(true);
    setPlatformPlan((prev) =>
      prev.map((entry) =>
        entry.platform === platform ? { ...entry, selected: !entry.selected } : entry,
      ),
    );
  }, []);

  // 保存编辑（乐观锁 PATCH）
  const handleSave = useCallback(async () => {
    if (!detail || !briefId || !currentProjectId || saving) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/content/briefs/${encodeURIComponent(briefId)}?projectId=${currentProjectId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            expectedRevision: detail.revision,
            editorial: {
              topic: editorValue.topic.trim() || detail.brief?.topic || "未命名主题",
              titleCandidates: editorValue.titleCandidates,
              outline: editorValue.outline.filter((s) => s.heading.trim() || s.purpose.trim()),
              keywords: editorValue.keywords,
              references: editorValue.references,
              notes: editorValue.notes,
            },
            selectedPlatforms,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        addToast({
          type: "error",
          title: "创作方案已在其他页面更新",
          description: "请刷新后继续。",
        });
        return;
      }
      if (!res.ok) {
        addToast({
          type: "error",
          title: "保存失败",
          description: json?.error?.message ?? "请稍后重试。",
        });
        return;
      }
      dirtyRef.current = false;
      setDirty(false);
      applyDetail(json.data as BriefDetail, true);
      addToast({ type: "success", title: "创作方案已保存" });
    } catch {
      addToast({ type: "error", title: "网络错误", description: "保存失败，请稍后重试。" });
    } finally {
      setSaving(false);
    }
  }, [detail, briefId, currentProjectId, saving, editorValue, selectedPlatforms, applyDetail, addToast]);

  // 提交：PR4 过渡期创建草稿（无生成）；工作流入口在 PR8 接入。
  const handleSubmit = useCallback(async () => {
    if (!currentProjectId || submitting || projectMismatch) return;
    if (!editorValue.topic.trim()) {
      addToast({ type: "error", title: "请输入内容主题" });
      return;
    }
    if (selectedPlatforms.length === 0) {
      addToast({ type: "error", title: "请至少选择一个支持的平台" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/content?projectId=${currentProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: editorValue.topic.trim(),
          keyPoints: editorValue.outline
            .filter((s) => s.heading.trim())
            .map((s) => (s.purpose ? `${s.heading}——${s.purpose}` : s.heading)),
          platforms: selectedPlatforms,
          references: editorValue.references.map((r) => r.url).join("\n"),
          notes: editorValue.notes,
          templateId: selectedTemplate || undefined,
          brandVoiceId: selectedVoice || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast({
          type: "error",
          title: "创建失败",
          description: json?.error?.message ?? "请稍后重试。",
        });
        return;
      }
      const newId = (json.data as { id?: string } | null)?.id;
      router.push(newId ? `/content/${newId}/edit` : "/content");
    } catch {
      addToast({ type: "error", title: "网络错误", description: "请稍后重试。" });
    } finally {
      setSubmitting(false);
    }
  }, [currentProjectId, submitting, projectMismatch, editorValue, selectedPlatforms, selectedTemplate, selectedVoice, router, addToast]);

  const refinementLabel =
    refinementStatus === "succeeded"
      ? "AI 提炼完成"
      : refinementStatus === "fallback"
        ? "已保留基础方案"
        : refinementStatus === "queued" || refinementStatus === "running"
          ? "AI 提炼中…"
          : null;

  if (briefId && loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="dashboard-skeleton h-10 w-48 rounded animate-skeleton-pulse" />
        <div className="dashboard-skeleton h-64 rounded-xl animate-skeleton-pulse" />
      </div>
    );
  }

  if (briefId && loadError) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <Link href="/content" className="dashboard-icon-button" style={{ textDecoration: "none" }}>
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            新建内容
          </h1>
        </div>
        <div className="dashboard-surface dashboard-surface--padded text-sm" style={{ color: "var(--text-secondary)" }}>
          {loadError}
          <div className="mt-3">
            <Link href="/content" className="dashboard-button dashboard-button--secondary">
              返回智创
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/content" className="dashboard-icon-button" style={{ textDecoration: "none" }}>
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
          {briefId ? "确认创作方案" : "新建内容"}
        </h1>
        {detail && (
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            来自智见建议 #{detail.source.suggestionId}
            {refinementLabel ? ` · ${refinementLabel}` : ""}
          </span>
        )}
      </div>

      {projectMismatch && (
        <div
          className="dashboard-surface dashboard-surface--padded text-sm"
          style={{ color: "var(--color-primary)", border: "1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)" }}
        >
          该创作方案属于其他项目。请切换回原项目后继续，方案不会被迁移。
        </div>
      )}

      {detail?.eligibility?.requiresConfirmation && !projectMismatch && (
        <div className="dashboard-surface dashboard-surface--padded text-sm" style={{ color: "var(--text-secondary)" }}>
          这条建议的内容方向需要你确认：检查主题和结构是否符合预期，可先编辑再继续。
        </div>
      )}

      <BriefEditor
        value={editorValue}
        onChange={handleEditorChange}
        disabled={projectMismatch}
      />

      <div>
        <label className="dashboard-field-label">目标平台</label>
        <PlatformCapabilitySelect
          plan={platformPlan}
          onToggle={togglePlatform}
          disabled={projectMismatch}
        />
      </div>

      {templates.length > 0 && (
        <div>
          <label className="dashboard-field-label">
            <LayoutTemplate size={13} className="inline mr-1" />
            内容模板
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="dashboard-input px-3 py-2 text-sm"
            style={{ width: "100%", fontSize: 14 }}
          >
            <option value="">不使用模板</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.category ? ` (${t.category})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {voices.length > 0 && (
        <div>
          <label className="dashboard-field-label">
            <Mic size={13} className="inline mr-1" />
            品牌声音
          </label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="dashboard-input px-3 py-2 text-sm"
            style={{ width: "100%", fontSize: 14 }}
          >
            <option value="">默认声音</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.toneKeywords?.length ? ` - ${v.toneKeywords.join(", ")}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || projectMismatch || !editorValue.topic.trim() || selectedPlatforms.length === 0}
          className="dashboard-button dashboard-button--primary px-5 py-2.5"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {submitting ? "提交中..." : "创建内容"}
        </button>
        {briefId && (
          <button
            onClick={handleSave}
            disabled={saving || !dirty || projectMismatch}
            className="dashboard-button dashboard-button--secondary px-4 py-2.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "保存中..." : dirty ? "保存修改" : "已保存"}
          </button>
        )}
        <Link
          href="/content"
          className="dashboard-button dashboard-button--secondary px-4 py-2.5"
          style={{ textDecoration: "none" }}
        >
          取消
        </Link>
      </div>
    </div>
  );
}

export default function NewContentPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 max-w-2xl">
          <div className="dashboard-skeleton h-10 w-48 rounded animate-skeleton-pulse" />
          <div className="dashboard-skeleton h-64 rounded-xl animate-skeleton-pulse" />
        </div>
      }
    >
      <NewContentInner />
    </Suspense>
  );
}
