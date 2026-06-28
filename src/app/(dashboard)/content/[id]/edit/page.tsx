"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Sparkles, Loader2, Calendar, Link as LinkIcon, BarChart3 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useProject } from "@/components/project/project-context";
import { ContentEditor } from "@/components/content/content-editor";
import { ContentAnalysisPanel } from "@/components/content/content-analysis-panel";
import { formatDateInTimeZone } from "@/lib/time";

const AIPanel = dynamic(
  () => import("@/components/content/ai-panel").then((mod) => ({ default: mod.AIPanel })),
  { ssr: false },
);

interface PlatformContent {
  id: string;
  platform: string;
  content: string;
  status: string;
}

interface ContentData {
  id: string;
  title: string;
  status: string;
  platformContents?: PlatformContent[];
  qualityScore?: number | null;
  scheduledAt?: string | null;
  reviewLink?: string | null;
  [key: string]: unknown;
}

// Status config (matching list page)
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:      { label: "草稿",     color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  generating: { label: "生成中",   color: "var(--color-primary)", bg: "color-mix(in srgb, var(--color-primary) 12%, transparent)" },
  review:     { label: "审核中",   color: "var(--color-warning)", bg: "color-mix(in srgb, var(--color-warning) 12%, transparent)" },
  approved:   { label: "已审核",   color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 10%, transparent)" },
  scheduled:  { label: "已排期",   color: "color-mix(in srgb, var(--color-primary) 80%, white)", bg: "color-mix(in srgb, var(--color-primary) 12%, transparent)" },
  publishing: { label: "发布中",   color: "var(--color-primary)", bg: "color-mix(in srgb, var(--color-primary) 15%, transparent)" },
  published:  { label: "已发布",   color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 12%, transparent)" },
  failed:     { label: "发布失败", color: "var(--color-error)",   bg: "color-mix(in srgb, var(--color-error) 12%, transparent)" },
  archived:   { label: "已归档",   color: "var(--text-muted)",    bg: "var(--bg-hover)" },
};

const PLATFORM_LABELS: Record<string, string> = {
  wechat: "微信公众号",
  weibo: "微博",
  douyin: "抖音",
  xiaohongshu: "小红书",
  toutiao: "今日头条",
  zhihu: "知乎",
};

export function getEditContentProjectError(projectLoading: boolean, currentProjectId: string | null) {
  if (projectLoading) return null;
  if (!currentProjectId) return "请先选择一个项目，再打开内容编辑页";
  return null;
}

function EditContentInner({ id }: { id: string }) {
  const { currentProjectId, loading: projectLoading } = useProject();
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [contentStatus, setContentStatus] = useState("draft");
  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [platformContents, setPlatformContents] = useState<PlatformContent[]>([]);
  const [activePlatform, setActivePlatform] = useState<string>("default");
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const editorRef = React.useRef<ReturnType<typeof import("@tiptap/react").useEditor> | null>(null);

  // Fetch existing content on mount
  useEffect(() => {
    if (!id) return;
    const projectError = getEditContentProjectError(projectLoading, currentProjectId);
    if (projectError) {
      setError(projectError);
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/content/${id}?projectId=${currentProjectId}`);
        if (!res.ok) {
          setError(res.status === 404 ? "内容不存在" : "加载失败");
          return;
        }
        const json = await res.json();
        if (cancelled) return;

        const data: ContentData = json.data ?? json;
        setTitle(data.title ?? "");
        setContentStatus(data.status ?? "draft");
        setQualityScore(data.qualityScore ?? null);
        setScheduledAt(data.scheduledAt ?? null);

        if (data.platformContents && data.platformContents.length > 0) {
          setPlatformContents(data.platformContents);
          // Default to first platform tab
          setActivePlatform(data.platformContents[0].platform);
          setContent(data.platformContents[0].content ?? "");
        } else {
          setContent((data as Record<string, unknown>).content as string ?? "");
        }
      } catch {
        if (!cancelled) setError("网络错误");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, currentProjectId, projectLoading]);

  // Switch platform tab
  const switchPlatform = useCallback((platform: string) => {
    const nextPlatformContents = platformContents.map((pc) =>
      pc.platform === activePlatform ? { ...pc, content } : pc
    );
    const nextPlatformContent = nextPlatformContents.find((p) => p.platform === platform);
    setPlatformContents(nextPlatformContents);
    setActivePlatform(platform);
    setContent(nextPlatformContent?.content ?? "");
  }, [activePlatform, content, platformContents]);

  const saveCurrentContent = useCallback(async () => {
    const body: Record<string, unknown> = { title };
    if (activePlatform !== "default") {
      body.platformContent = { platform: activePlatform, content };
    } else if (platformContents.length > 0) {
      body.platformContent = { platform: platformContents[0].platform, content };
    } else {
      body.content = content;
    }

    const res = await fetch(`/api/content/${id}?projectId=${currentProjectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Save failed");
      return false;
    }

    const json = await res.json();
    const updated = (json.data ?? json) as ContentData;
    if (updated.platformContents?.length) {
      setPlatformContents(updated.platformContents);
    } else if (activePlatform !== "default") {
      setPlatformContents((prev) =>
        prev.map((pc) => pc.platform === activePlatform ? { ...pc, content } : pc)
      );
    }
    setError(null);
    return true;
  }, [activePlatform, content, currentProjectId, id, platformContents, title]);

  const handleInsert = useCallback((text: string) => {
    if (editorRef.current) {
      editorRef.current.commands.insertContent(text);
    } else {
      setContent((prev) => prev + text);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentProjectId || saving) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { title };
      // Save platform-specific content if on a platform tab
      if (activePlatform !== "default") {
        body.platformContent = { platform: activePlatform, content };
      }
      const res = await fetch(`/api/content/${id}?projectId=${currentProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "保存失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }, [id, currentProjectId, title, content, activePlatform, saving]);

  const handlePublish = useCallback(async () => {
    if (!currentProjectId || saving) return;
    const currentPlatformContent = platformContents.find((pc) => pc.platform === activePlatform);
    if (!currentPlatformContent) {
      setError("No platform content selected");
      return;
    }
    setSaving(true);
    try {
      // Save first
      const saveRes = await fetch(`/api/content/${id}?projectId=${currentProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, platformContent: { platform: activePlatform, content } }),
      });
      if (!saveRes.ok) {
        const data = await saveRes.json();
        setError(data.error || "保存失败");
        return;
      }
      const pubRes = await fetch(`/api/publish/${currentPlatformContent.id}?projectId=${currentProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId }),
      });
      if (!pubRes.ok) {
        const data = await pubRes.json();
        setError(data.error || "发布失败");
      } else {
        const json = await pubRes.json();
        const published = json.data ?? json;
        setPlatformContents((prev) =>
          prev.map((pc) => pc.id === currentPlatformContent.id ? { ...pc, ...published, status: "published" } : pc)
        );
        const allPublished = platformContents.every((pc) =>
          pc.id === currentPlatformContent.id ? true : pc.status === "published"
        );
        setContentStatus(allPublished ? "published" : "publishing");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }, [activePlatform, currentProjectId, content, id, platformContents, saving, title]);

  const handleSchedule = useCallback(async () => {
    if (!currentProjectId || !scheduleDate) return;
    setSaving(true);
    try {
      const saved = await saveCurrentContent();
      if (!saved) return;
      const res = await fetch(`/api/content/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId, scheduledAt: scheduleDate }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "排期失败");
      } else {
        setContentStatus("scheduled");
        setScheduledAt(scheduleDate);
        setShowSchedule(false);
      }
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }, [id, currentProjectId, scheduleDate, saveCurrentContent]);

  const handleScore = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      const res = await fetch(`/api/content/${id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId }),
      });
      if (res.ok) {
        const json = await res.json();
        setQualityScore(json.data?.score ?? json.data?.qualityScore ?? null);
      }
    } catch {
      // Silently fail
    }
  }, [id, currentProjectId]);

  const statusCfg = STATUS_CONFIG[contentStatus] ?? STATUS_CONFIG.draft;

  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        <div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
      </div>
    );
  }

  if (error && !title) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center gap-3">
          <Link
            href="/content"
            className="inline-flex items-center justify-center"
            style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", color: "var(--text-secondary)", textDecoration: "none" }}
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-error)", fontFamily: "var(--font-display)" }}>
            {error}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/content"
            className="inline-flex items-center justify-center"
            style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", color: "var(--text-secondary)", textDecoration: "none" }}
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold truncate max-w-md" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              {title || "编辑内容"}
            </h1>
            {/* Status badge */}
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0"
              style={{ color: statusCfg.color, background: statusCfg.bg, fontFamily: "var(--font-body)" }}
            >
              {statusCfg.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Quality score */}
          {qualityScore != null && (
            <span className="text-xs font-mono px-2 py-1 rounded-md"
              style={{
                background: qualityScore >= 80 ? "color-mix(in srgb, var(--color-success) 10%, transparent)"
                  : qualityScore >= 60 ? "color-mix(in srgb, var(--color-warning) 10%, transparent)"
                  : "var(--bg-hover)",
                color: qualityScore >= 80 ? "var(--color-success)"
                  : qualityScore >= 60 ? "var(--color-warning)"
                  : "var(--text-secondary)",
              }}
            >
              <BarChart3 size={11} className="inline mr-1" />
              {qualityScore.toFixed(0)}分
            </span>
          )}
          <button onClick={handleScore}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md"
            style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "none", fontFamily: "var(--font-body)", cursor: "pointer" }}
          >
            <BarChart3 size={12} />
            质量评分
          </button>
          <button onClick={() => setShowAI(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md"
            style={{ background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", color: "var(--color-primary)", border: "none", fontFamily: "var(--font-body)", cursor: "pointer" }}
          >
            <Sparkles size={14} />
            AI 助手
          </button>
        </div>
      </div>

      {/* Multi-platform tabs */}
      {platformContents.length > 1 && (
        <div className="flex items-center gap-1 border-b" style={{ borderColor: "var(--border)" }}>
          {platformContents.map((pc) => {
            const isActive = activePlatform === pc.platform;
            return (
              <button
                key={pc.platform}
                onClick={() => switchPlatform(pc.platform)}
                className="text-sm px-3 py-2 -mb-px transition-colors"
                style={{
                  color: isActive ? "var(--color-primary)" : "var(--text-muted)",
                  fontFamily: "var(--font-body)",
                  background: "transparent",
                  border: "none",
                  borderBottom: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                  cursor: "pointer",
                }}
              >
                {PLATFORM_LABELS[pc.platform] ?? pc.platform}
                {pc.status === "published" && (
                  <span className="ml-1 text-[10px]" style={{ color: "var(--color-success)" }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Title input */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题"
        className="w-full"
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          fontSize: 24,
          fontWeight: 600,
          fontFamily: "var(--font-display)",
          color: "var(--text-primary)",
          padding: 0,
        }}
      />

      {/* Editor */}
      <ContentEditor
        key={activePlatform}
        initialContent={content}
        onUpdate={setContent}
        editorRef={editorRef}
      />

      <ContentAnalysisPanel
        contentPieceId={id}
        projectId={currentProjectId}
        content={content}
        platform={activePlatform}
        onContentUpdate={async (nextContent) => {
          setContent(nextContent);
          editorRef.current?.commands.setContent(nextContent);
          return true;
        }}
      />

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
          style={{
            background: "var(--color-primary)",
            color: "white",
            border: "none",
            fontFamily: "var(--font-body)",
            cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          保存
        </button>
        {contentStatus !== "published" && (
          <button
            onClick={handlePublish}
            disabled={saving}
            className="text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
            style={{
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-body)",
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            发布
          </button>
        )}
        {contentStatus !== "published" && contentStatus !== "scheduled" && (
          <button
            onClick={() => setShowSchedule(!showSchedule)}
            className="text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
            style={{
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-body)",
              cursor: "pointer",
            }}
          >
            <Calendar size={13} />
            排期
          </button>
        )}
      </div>

      {/* Schedule picker */}
      {showSchedule && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <Calendar size={14} style={{ color: "var(--text-muted)" }} />
          <input
            type="datetime-local"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button onClick={handleSchedule} disabled={saving || !scheduleDate}
            className="text-sm font-medium px-3 py-1.5 rounded-md"
            style={{
              background: "var(--color-primary)",
              color: "white",
              border: "none",
              fontFamily: "var(--font-body)",
              cursor: saving ? "wait" : "pointer",
              opacity: saving || !scheduleDate ? 0.6 : 1,
            }}
          >
            确认排期
          </button>
        </div>
      )}

      {/* Scheduled info */}
      {scheduledAt && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-md"
          style={{ background: "color-mix(in srgb, var(--color-primary) 8%, transparent)" }}
        >
          <Calendar size={12} style={{ color: "var(--color-primary)" }} />
          <span style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)" }}>
            计划发布: {formatDateInTimeZone(scheduledAt, { includeYear: true })}
          </span>
        </div>
      )}

      {/* Error bar */}
      {error && title && (
        <div className="text-xs px-3 py-2 rounded-md"
          style={{ background: "color-mix(in srgb, var(--color-error) 10%, transparent)", color: "var(--color-error)", fontFamily: "var(--font-body)" }}
        >
          {error}
        </div>
      )}

      {/* AI Panel overlay */}
      {showAI && currentProjectId && (
        <AIPanel
          projectId={currentProjectId}
          contentId={id}
          topic={title}
          onInsert={handleInsert}
          onClose={() => setShowAI(false)}
        />
      )}
    </div>
  );
}

export default function EditContentPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 max-w-4xl">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <EditContentInnerWithParams />
    </Suspense>
  );
}

function EditContentInnerWithParams() {
  const params = useParams();
  return <EditContentInner id={params.id as string} />;
}
