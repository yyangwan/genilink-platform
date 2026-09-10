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
import {
  clearPendingSubmission,
  loadPendingSubmission,
  savePendingSubmission,
} from "@/lib/content/submission-recovery";

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
    strategy: { objective: "", audience: "", intent: "", contentType: "" },
    outline: Array.from({ length: 4 }, (_, i) => ({
      id: `section_${i + 1}`,
      heading: "",
      purpose: "",
      evidenceRefs: [],
    })),
    keywords: [],
    references: [],
    notes: "",
    lockedMust: [],
    lockedAvoid: [],
    editableMust: [],
    editableAvoid: [],
  };
}

function editorValueFromBrief(detail: BriefDetail): BriefEditorValue {
  const brief = detail.brief;
  if (!brief) return emptyEditorValue();
  return {
    topic: brief.topic,
    titleCandidates: brief.titleCandidates,
    strategy: {
      objective: brief.strategy.objective,
      audience: brief.strategy.audience ?? "",
      intent: brief.strategy.intent,
      contentType: brief.strategy.contentType,
    },
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
    lockedMust: brief.constraints.locked.mustMention,
    lockedAvoid: brief.constraints.locked.avoidMention,
    editableMust: brief.constraints.editable.mustMention,
    editableAvoid: brief.constraints.editable.avoidMention,
  };
}

/**
 * strategy + editable 约束的 PATCH 片段（§16.2：目的/读者可编辑，editable 约束可编辑）。
 * objective 契约 minLength 1：清空时回落到现有值，避免整单 422。
 * 仅在 Brief 实际存在（briefId 模式加载完成）时携带。
 */
function strategyPatch(detail: BriefDetail, editorValue: BriefEditorValue) {
  const brief = detail.brief;
  if (!brief) return {};
  const audience = editorValue.strategy.audience.trim();
  return {
    strategy: {
      objective: editorValue.strategy.objective.trim() || brief.strategy.objective,
      ...(audience ? { audience } : {}),
    },
    constraints: {
      editable: {
        mustMention: editorValue.editableMust,
        avoidMention: editorValue.editableAvoid,
      },
    },
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
  // 恢复横幅初值在首渲染读取（避免 effect 内同步 setState）。
  const [pendingRecovery, setPendingRecovery] = useState(() =>
    Boolean(briefId && typeof window !== "undefined" && loadPendingSubmission(briefId)),
  );
  const dirtyRef = useRef(false);
  // 工作流提交幂等键：结果不确定（超时）时保留，重试复用同一键；
  // 同时持久化到 sessionStorage，刷新后可安全重放找回 workflowId（R3）。
  const submitKeyRef = useRef<string | null>(null);

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
          // 切回原项目后重新加载成功：清除此前错项目留下的错误（R14）。
          setLoadError(null);
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

  // 手工模式（无 briefId）初始化平台能力（R6）：Brief 计划来自 ContentOS，
  // 手工模式没有来源，需单独拉取能力表，否则平台无法选择、提交永久禁用。
  useEffect(() => {
    if (briefId || !currentProjectId) return;
    let cancelled = false;
    fetch(`/api/content/capabilities?projectId=${currentProjectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.data) return;
        const entries = Object.entries(
          json.data as Record<string, { enabled?: boolean; reason?: string }>,
        ).map(([platform, cap]) => ({
          platform,
          capability: (cap.enabled ? "supported" : "unsupported") as PlatformPlanEntry["capability"],
          selected: false,
          ...(cap.enabled ? {} : { reason: cap.reason }),
        }));
        setPlatformPlan(entries);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [briefId, currentProjectId]);

  // 未决提交恢复（R3）：刷新后用同一幂等键安全重放，找回 workflowId。
  useEffect(() => {
    if (!briefId || !currentProjectId) return;
    const pending = loadPendingSubmission(briefId);
    if (!pending) return;
    submitKeyRef.current = pending.key;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/content/workflows?projectId=${currentProjectId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": pending.key },
          body: JSON.stringify(pending.body),
        });
        if (cancelled) return;
        const json = await res.json().catch(() => ({}));
        if (res.ok && !json.meta?.uncertain) {
          clearPendingSubmission(briefId);
          submitKeyRef.current = null;
          const workflowId = (json.data as { id?: string } | null)?.id;
          if (workflowId) {
            router.push(`/content/workflows/${workflowId}`);
            return;
          }
          setPendingRecovery(false);
          return;
        }
        if (res.ok && json.meta?.uncertain) return; // 仍在确认，保留凭据。
        const code = json?.error?.code;
        if (code === "WORKFLOW_ALREADY_EXISTS" || res.status >= 500) return; // 保留凭据。
        // 明确拒绝（校验失败/键滥用等）：凭据作废。
        clearPendingSubmission(briefId);
        submitKeyRef.current = null;
        setPendingRecovery(false);
      } catch {
        // 网络错误：保留凭据，用户手动重试即安全重放。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [briefId, currentProjectId, router]);

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
    setPlatformPlan((prev) => {
      // 手工模式计划为空或缺少该平台时补上（R6），否则无法加入任何平台。
      if (!prev.some((entry) => entry.platform === platform)) {
        return [...prev, { platform, capability: "supported" as const, selected: true }];
      }
      return prev.map((entry) =>
        entry.platform === platform ? { ...entry, selected: !entry.selected } : entry,
      );
    });
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
            ...strategyPatch(detail, editorValue),
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

  // 提交：有 Brief 时走内容工作流（预占额度 → ContentOS 异步生成 → 进度页）；
  // 手工模式（无 briefId）创建草稿进入编辑器，生成入口仍是工作流。
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
      if (briefId && detail) {
        let currentRevision = detail.revision;
        // 有未保存的编辑时先保存，保证工作流使用最新 revision。
        if (dirtyRef.current) {
          const saved = await fetch(
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
          const savedJson = await saved.json().catch(() => ({}));
          if (saved.status === 409) {
            addToast({
              type: "error",
              title: "创作方案已在其他页面更新",
              description: "请刷新后继续。",
            });
            return;
          }
          if (!saved.ok) {
            addToast({
              type: "error",
              title: "保存失败",
              description: savedJson?.error?.message ?? "请稍后重试。",
            });
            return;
          }
          const savedDetail = savedJson.data as BriefDetail | null;
          if (savedDetail?.revision) currentRevision = savedDetail.revision;
          dirtyRef.current = false;
          setDirty(false);
          applyDetail(savedDetail ?? detail, true);
        }

        submitKeyRef.current = submitKeyRef.current ?? crypto.randomUUID();
        const submitBody = {
          briefId,
          briefRevision: currentRevision,
          platforms: selectedPlatforms,
          templateId: selectedTemplate || undefined,
          brandVoiceId: selectedVoice || undefined,
        };
        // 持久化恢复凭据（R3）：不确定响应/刷新后用同一键+同一请求体安全重放。
        savePendingSubmission(briefId, {
          key: submitKeyRef.current,
          body: submitBody,
          savedAt: Date.now(),
        });
        const res = await fetch(`/api/content/workflows?projectId=${currentProjectId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": submitKeyRef.current,
          },
          body: JSON.stringify(submitBody),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.meta?.uncertain) {
          // 结果不确定：保留幂等键与凭据，重试复用（设计 §13.3/R3）。
          addToast({
            type: "info",
            title: "正在确认",
            description: "请求结果确认中，请勿重复提交；稍后自动恢复。",
            duration: 6000,
          });
          return;
        }
        if (res.ok) {
          clearPendingSubmission(briefId);
          submitKeyRef.current = null;
          const workflowId = (json.data as { id?: string } | null)?.id;
          if (workflowId) {
            router.push(`/content/workflows/${workflowId}`);
          }
          return;
        }
        const code = json?.error?.code as string | undefined;
        if (code === "WORKFLOW_ALREADY_EXISTS") {
          // 已受理但状态未定（R4）：保留凭据，稍后同键重试可安全取回结果。
          addToast({
            type: "info",
            title: "该请求已受理",
            description: "正在确认生成状态，请稍后在此页重试或到内容列表查看。",
            duration: 8000,
          });
          return;
        }
        if (code === "IDEMPOTENCY_KEY_REUSED") {
          // 键与不同请求体冲突：凭据不可再用。
          clearPendingSubmission(briefId);
          submitKeyRef.current = null;
          addToast({
            type: "error",
            title: "提交冲突",
            description: "请刷新页面后重新提交。",
          });
          return;
        }
        if (res.status === 402) {
          clearPendingSubmission(briefId);
          submitKeyRef.current = null;
          addToast({
            type: "error",
            title: "本月生成额度已用完",
            description: "可在设置中升级套餐。",
          });
          return;
        }
        if (res.status >= 500) {
          // 服务不可用/不确定：保留凭据，同键重试安全，不会重复创建或扣额。
          addToast({
            type: "info",
            title: "服务暂不可用",
            description: "提交正在保留，请稍后点击重试；不会重复扣除额度。",
            duration: 8000,
          });
          return;
        }
        // 其余 4xx 明确拒绝：凭据作废。
        clearPendingSubmission(briefId);
        submitKeyRef.current = null;
        addToast({
          type: "error",
          title: "提交失败",
          description: json?.error?.message ?? "请稍后重试。",
        });
        return;
      }

      // 手工模式：仅创建草稿。
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
  }, [currentProjectId, submitting, projectMismatch, editorValue, selectedPlatforms, selectedTemplate, selectedVoice, router, addToast, briefId, detail, applyDetail]);

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

      {pendingRecovery && !projectMismatch && (
        <div
          className="dashboard-surface dashboard-surface--padded text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          上次提交仍在确认中，正在为你恢复结果——请勿重复提交。若稍后仍未跳转，
          再次点击“创建内容”会用同一凭据安全找回，不会重复创建或扣额。
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

      {/* v1 工作流生成提示词不消费模板（覆盖审计）：模板选择只在手工草稿模式提供。 */}
      {!briefId && templates.length > 0 && (
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
