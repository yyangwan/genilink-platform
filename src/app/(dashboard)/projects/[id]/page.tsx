"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "@/components/project/project-context";
import {
  ArrowLeft,
  Globe,
  Building2,
  Calendar,
  Eye,
  LayoutDashboard,
  ExternalLink,
  AlertCircle,
  Settings,
  Package,
  Tag,
  Plus,
  X,
  Loader2,
  Star,
  Swords,
} from "lucide-react";
import { sectionCard } from "@/components/charts/shared";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-context";
import { formatDateInTimeZone } from "@/lib/time";

interface ProjectData {
  id: string;
  name: string;
  url: string | null;
  industry: string | null;
  productName: string | null;
  productKeywords: string[];
  productDescription: string | null;
  productUrl: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

interface Brand {
  id: string;
  name: string;
  aliases: string[];
  isCompetitor: boolean;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { selectProject, openWizard, projects, wizardOpen } = useProject();
  const projectId = params.id as string;

  const navigateWithProject = (path: string) => {
    selectProject(projectId);
    router.push(path);
  };

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadProject = async () => {
      setLoading(true);
      setError(false);

      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) throw new Error("Failed");

        const data = await res.json();
        if (!cancelled && data?.project) {
          setProject(data.project);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Re-fetch when wizard closes after editing
  const prevWizardOpen = useRef(false);
  useEffect(() => {
    if (prevWizardOpen.current && !wizardOpen) {
      let cancelled = false;

      const reloadProject = async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}`);
          if (!res.ok) throw new Error("Failed");

          const data = await res.json();
          if (!cancelled && data?.project) {
            setProject(data.project);
          }
        } catch {
          if (!cancelled) setError(true);
        }
      };

      void reloadProject();

      return () => {
        cancelled = true;
      };
    }
    prevWizardOpen.current = wizardOpen;
  }, [wizardOpen, projectId]);

  // Brand association state
  const { addToast } = useToast();
  const [associatedBrands, setAssociatedBrands] = useState<Brand[]>([]);
  const [allBrands, setAllBrands] = useState<Brand[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [brandLoading, setBrandLoading] = useState(false);
  const [disassociateTarget, setDisassociateTarget] = useState<Brand | null>(null);

  const fetchBrands = useCallback(async () => {
    const [assocRes, allRes] = await Promise.all([
      fetch(`/api/projects/${projectId}/brands`),
      fetch("/api/brands"),
    ]);
    if (assocRes.ok) {
      const data = await assocRes.json();
      setAssociatedBrands(data.brands || []);
    }
    if (allRes.ok) {
      setAllBrands(await allRes.json());
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    const loadBrands = async () => {
      const [assocRes, allRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/brands`),
        fetch("/api/brands"),
      ]);

      if (cancelled) return;

      if (assocRes.ok) {
        const data = await assocRes.json();
        if (!cancelled) setAssociatedBrands(data.brands || []);
      }
      if (allRes.ok && !cancelled) {
        setAllBrands(await allRes.json());
      }
    };

    void loadBrands();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const associateBrand = useCallback(async (brandId: string) => {
    setBrandLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/brands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (res.ok) {
        await fetchBrands();
        setShowPicker(false);
        addToast({ type: "success", title: "品牌已关联" });
      } else {
        const data = await res.json().catch(() => ({}));
        addToast({ type: "error", title: data.error || "关联失败" });
      }
    } catch {
      addToast({ type: "error", title: "网络错误" });
    } finally {
      setBrandLoading(false);
    }
  }, [projectId, fetchBrands, addToast]);

  const disassociateBrand = useCallback(async () => {
    if (!disassociateTarget) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/brands`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: disassociateTarget.id }),
      });
      if (res.ok) {
        await fetchBrands();
        addToast({ type: "success", title: "已取消关联" });
      } else {
        addToast({ type: "error", title: "取消关联失败" });
      }
    } catch {
      addToast({ type: "error", title: "网络错误" });
    } finally {
      setDisassociateTarget(null);
    }
  }, [disassociateTarget, projectId, fetchBrands, addToast]);

  const associatedIds = new Set(associatedBrands.map((b) => b.id));
  const availableBrands = allBrands.filter((b) => !associatedIds.has(b.id));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        <div className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="p-2 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "none" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </div>
        <div style={sectionCard}>
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-10 h-10 mb-3" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              项目不存在或无权访问
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Link
          href="/projects"
          className="p-2 rounded-lg transition-colors"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-sectionHeading)",
            }}
          >
            {project.name}
          </h1>
        </div>
        <button
          onClick={() => {
            const p = projects.find((pr) => pr.id === projectId);
            if (p) openWizard(p);
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          <Settings className="w-4 h-4" />
          编辑
        </button>
      </div>

      {/* Project info card */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          项目信息
        </h3>
        <div className="space-y-4">
          {project.url && (
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                {project.url}
              </span>
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded"
                style={{ color: "var(--text-muted)" }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
          {project.industry && (
            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                {project.industry}
              </span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              创建于 {formatDateInTimeZone(project.createdAt, { includeTime: false, includeYear: true })}
            </span>
          </div>
        </div>
      </div>

      {/* Product info card */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          产品信息
        </h3>
        {project.productName || project.productDescription || project.productUrl || project.productKeywords?.length > 0 ? (
          <div className="space-y-4">
            {project.productName && (
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                  {project.productName}
                </span>
              </div>
            )}
            {project.productDescription && (
              <p className="text-sm pl-7" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                {project.productDescription}
              </p>
            )}
            {project.productUrl && (
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                  {project.productUrl}
                </span>
                <a
                  href={project.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded"
                  style={{ color: "var(--text-muted)" }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
            {project.productKeywords && project.productKeywords.length > 0 && (
              <div className="flex items-center gap-3">
                <Tag className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                <div className="flex flex-wrap gap-1.5">
                  {project.productKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                      style={{
                        background: "var(--color-primary-dim)",
                        color: "var(--color-primary)",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center py-6">
            <p className="text-sm mb-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              暂未填写产品信息
            </p>
            <button
              onClick={() => {
                const p = projects.find((pr) => pr.id === projectId);
                if (p) openWizard(p);
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--color-primary-dim)",
                color: "var(--color-primary)",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              填写产品信息
            </button>
          </div>
        )}
      </div>

      {/* Analysis status card */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          分析状态
        </h3>
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: "var(--color-success)" }}
          />
          <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
            使用统一项目 ID 接入分析服务
          </span>
        </div>
      </div>

      {/* Brand association card */}
      <div style={sectionCard}>
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            关联品牌
          </h3>
          {availableBrands.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowPicker(!showPicker)}
                disabled={brandLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--color-primary-dim)",
                  color: "var(--color-primary)",
                  border: "none",
                  cursor: brandLoading ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-body)",
                  opacity: brandLoading ? 0.5 : 1,
                }}
              >
                {brandLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                关联品牌
              </button>
              {showPicker && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: 4,
                    minWidth: 200,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    zIndex: 50,
                    maxHeight: 240,
                    overflowY: "auto",
                  }}
                >
                  {availableBrands.map((brand) => (
                    <button
                      key={brand.id}
                      onClick={() => associateBrand(brand.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        fontFamily: "var(--font-body)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {brand.isCompetitor ? (
                        <Swords className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--color-warning)" }} />
                      ) : (
                        <Star className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--color-success)" }} />
                      )}
                      <span style={{ flex: 1 }}>{brand.name}</span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{
                          background: brand.isCompetitor ? "var(--color-warning)20" : "var(--color-success)20",
                          color: brand.isCompetitor ? "var(--color-warning)" : "var(--color-success)",
                        }}
                      >
                        {brand.isCompetitor ? "竞品" : "自有"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {associatedBrands.length > 0 ? (
          <div className="space-y-2">
            {associatedBrands.map((brand) => (
              <div
                key={brand.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: "var(--bg-hover)" }}
              >
                {brand.isCompetitor ? (
                  <Swords className="w-4 h-4 shrink-0" style={{ color: "var(--color-warning)" }} />
                ) : (
                  <Star className="w-4 h-4 shrink-0" style={{ color: "var(--color-success)" }} />
                )}
                <span
                  className="text-sm flex-1"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
                >
                  {brand.name}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: brand.isCompetitor ? "var(--color-warning)20" : "var(--color-success)20",
                    color: brand.isCompetitor ? "var(--color-warning)" : "var(--color-success)",
                  }}
                >
                  {brand.isCompetitor ? "竞品" : "自有"}
                </span>
                <button
                  onClick={() => setDisassociateTarget(brand)}
                  className="p-1 rounded transition-colors"
                  style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-6">
            <p className="text-sm mb-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              暂未关联品牌
            </p>
            {allBrands.length > 0 ? (
              <button
                onClick={() => setShowPicker(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--color-primary-dim)",
                  color: "var(--color-primary)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                关联品牌
              </button>
            ) : (
              <Link
                href="/brands"
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--color-primary-dim)",
                  color: "var(--color-primary)",
                  textDecoration: "none",
                  fontFamily: "var(--font-body)",
                }}
              >
                前往创建品牌
              </Link>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!disassociateTarget}
        title="取消品牌关联"
        message={`确定要取消「${disassociateTarget?.name}」与此项目的关联吗？`}
        confirmLabel="取消关联"
        cancelLabel="返回"
        onConfirm={disassociateBrand}
        onCancel={() => setDisassociateTarget(null)}
      />

      {/* Action links */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => navigateWithProject("/visibility")}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: "var(--color-primary)",
            color: "#0b0d14",
            fontFamily: "var(--font-body)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-primary)")}
        >
          <Eye className="w-4 h-4" />
          查看分析
        </button>
        <button
          onClick={() => navigateWithProject("/website-analysis")}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
            border: "1px solid var(--border)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
        >
          <Globe className="w-4 h-4" />
          网站分析
        </button>
        <button
          onClick={() => navigateWithProject("/dashboard")}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
            border: "1px solid var(--border)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
        >
          <LayoutDashboard className="w-4 h-4" />
          工作台
        </button>
      </div>
    </div>
  );
}
