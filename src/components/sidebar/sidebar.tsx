"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  FolderKanban,
  Eye,
  PenTool,
  Settings,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Check,
  Play,
  FileText,
  Clock,
  Lightbulb,
  TrendingUp,
  GitCompareArrows,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const SIDEBAR_WIDTH = "220px";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

interface Workspace {
  id: string;
  name: string;
}

const topItems: NavItem[] = [
  { label: "工作台", href: "/dashboard", icon: LayoutDashboard },
  { label: "项目管理", href: "/projects", icon: FolderKanban },
];

const zhijianSection: NavSection = {
  id: "zhijian",
  label: "智見",
  icon: Eye,
  items: [
    { label: "可见性分析", href: "/visibility", icon: Play },
    { label: "审计记录", href: "/audits", icon: FileText },
    { label: "定时任务", href: "/schedules", icon: Clock },
    { label: "优化建议", href: "/suggestions", icon: Lightbulb },
    { label: "趋势分析", href: "/trends", icon: TrendingUp },
    { label: "竞品对比", href: "/compare", icon: GitCompareArrows },
  ],
};

const zhichuangItem: NavItem = {
  label: "智創",
  href: "/content",
  icon: PenTool,
};

const bottomItems: NavItem[] = [
  { label: "设置", href: "/settings", icon: Settings },
];

function getAccordionState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem("sidebar-accordion");
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveAccordionState(state: Record<string, boolean>) {
  try {
    localStorage.setItem("sidebar-accordion", JSON.stringify(state));
  } catch {}
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [accordion, setAccordion] = useState<Record<string, boolean>>({});

  // Load accordion state from localStorage
  useEffect(() => {
    setAccordion(getAccordionState());
  }, []);

  // Auto-expand 智見 if current route is a 智見 page
  useEffect(() => {
    const isZhijianRoute = zhijianSection.items.some((item) => pathname.startsWith(item.href));
    if (isZhijianRoute && !accordion[zhijianSection.id]) {
      setAccordion((prev) => {
        const next = { ...prev, [zhijianSection.id]: true };
        saveAccordionState(next);
        return next;
      });
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAccordion = (sectionId: string) => {
    setAccordion((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      saveAccordionState(next);
      return next;
    });
  };

  // Fetch workspaces on mount
  useEffect(() => {
    fetch("/api/workspaces")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.workspaces) {
          setWorkspaces(data.workspaces);
        }
      })
      .catch(() => {});

    const cookies = document.cookie.split("; ");
    const wsCookie = cookies.find((c) => c.startsWith("genilink-workspace="));
    if (wsCookie) {
      setCurrentWorkspaceId(wsCookie.split("=")[1]);
    }
  }, []);

  const handleSwitchWorkspace = async (workspaceId: string) => {
    if (workspaceId === currentWorkspaceId) {
      setWorkspaceOpen(false);
      return;
    }

    setSwitching(true);
    try {
      const res = await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });

      if (res.ok) {
        setCurrentWorkspaceId(workspaceId);
        document.cookie = `genilink-workspace=${workspaceId};path=/;max-age=${365 * 24 * 60 * 60}`;
        // Clear project cookie since projects are workspace-scoped
        document.cookie = `genilink-project=;path=/;max-age=0`;
        setWorkspaceOpen(false);
        router.refresh();
      }
    } catch {
    } finally {
      setSwitching(false);
    }
  };

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0];

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const isActive = useCallback(
    (href: string) => {
      if (href === "/dashboard") return pathname === "/dashboard";
      return pathname.startsWith(href);
    },
    [pathname]
  );

  const isSectionActive = (section: NavSection) =>
    section.items.some((item) => isActive(item.href));

  const navLink = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative",
          "duration-[var(--duration-short)]"
        )}
        style={{
          color: active ? "var(--text-primary)" : "var(--text-secondary)",
          background: active ? "var(--bg-elevated)" : "transparent",
          borderLeft: active ? "2px solid var(--color-primary)" : "2px solid transparent",
          fontFamily: "var(--font-body)",
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = "transparent";
        }}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="w-[18px] h-[18px] shrink-0" />
        <span>{item.label}</span>
      </Link>
    );
  };

  const sidebarContent = (
    <>
      {/* Brand header */}
      <div className="flex items-center justify-between px-5 h-16 shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{
              background: "var(--color-primary-dim)",
              color: "var(--color-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            智
          </div>
          <span
            className="text-base font-semibold tracking-tight"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            智链
          </span>
        </div>

        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1 rounded-md transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Workspace selector */}
      <div className="px-3 mb-2">
        <button
          onClick={() => setWorkspaceOpen(!workspaceOpen)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{
            color: "var(--text-secondary)",
            background: workspaceOpen ? "var(--bg-elevated)" : "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={(e) => {
            if (!workspaceOpen) e.currentTarget.style.background = "transparent";
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-xs font-medium uppercase tracking-wider shrink-0"
              style={{ fontFamily: "var(--font-display)" }}
            >
              工作区
            </span>
            {currentWorkspace && (
              <span
                className="text-xs truncate"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
              >
                · {currentWorkspace.name}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn("w-3.5 h-3.5 transition-transform shrink-0", workspaceOpen && "rotate-180")}
          />
        </button>

        {workspaceOpen && (
          <div
            className="mt-1 rounded-lg overflow-hidden"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            {workspaces.map((ws) => {
              const isCurrent = ws.id === currentWorkspaceId || (ws === workspaces[0] && !currentWorkspaceId);
              return (
                <button
                  key={ws.id}
                  onClick={() => handleSwitchWorkspace(ws.id)}
                  disabled={switching}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors"
                  style={{
                    color: isCurrent ? "var(--text-primary)" : "var(--text-secondary)",
                    background: isCurrent ? "var(--bg-hover)" : "transparent",
                    border: "none",
                    cursor: switching ? "not-allowed" : "pointer",
                    fontFamily: "var(--font-body)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span className="truncate">{ws.name}</span>
                  {isCurrent && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--color-primary)" }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto" aria-label="主导航">
        {/* Top items */}
        {topItems.map(navLink)}

        {/* Divider */}
        <div className="my-2" style={{ borderTop: "1px solid var(--border)" }} />

        {/* 智見 accordion section */}
        <div>
          <button
            onClick={() => toggleAccordion(zhijianSection.id)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-all"
            style={{
              color: isSectionActive(zhijianSection) ? "var(--text-primary)" : "var(--text-secondary)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-display)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            aria-expanded={accordion[zhijianSection.id]}
          >
            <div className="flex items-center gap-3">
              <Eye className="w-[18px] h-[18px] shrink-0" />
              <span className="text-xs font-medium uppercase tracking-wider">{zhijianSection.label}</span>
            </div>
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform shrink-0 duration-[var(--duration-medium)]",
                accordion[zhijianSection.id] && "rotate-180"
              )}
            />
          </button>

          {/* Collapsible children */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-[var(--duration-medium)]",
              accordion[zhijianSection.id] ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="pl-4 space-y-0.5">
              {zhijianSection.items.map((item) => navLink(item))}
            </div>
          </div>
        </div>

        {/* 智創 */}
        {navLink(zhichuangItem)}

        {/* Divider */}
        <div className="my-2" style={{ borderTop: "1px solid var(--border)" }} />
      </nav>

      {/* Bottom section */}
      <div
        className="shrink-0 px-3 pb-4 pt-2 space-y-0.5"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {bottomItems.map(navLink)}

        <button
          onClick={() => setLogoutConfirm(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--color-error)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          <span>退出登录</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 flex lg:hidden p-2 rounded-lg"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 block lg:hidden"
          style={{ background: "rgba(0, 0, 0, 0.6)" }}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "hidden lg:flex flex-col fixed top-0 left-0 h-full z-50",
          "transition-transform duration-[var(--duration-medium)]"
        )}
        style={{
          width: SIDEBAR_WIDTH,
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
        }}
        role="navigation"
        aria-label="侧边栏导航"
      >
        {sidebarContent}
      </aside>

      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-50 block lg:hidden",
          "transition-transform duration-[var(--duration-medium)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          width: SIDEBAR_WIDTH,
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
        }}
        role="navigation"
        aria-label="侧边栏导航"
        aria-hidden={!mobileOpen}
      >
        {sidebarContent}
      </aside>

      <ConfirmDialog
        open={logoutConfirm}
        onConfirm={() => {
          setLogoutConfirm(false);
          signOut({ callbackUrl: "/auth/login" });
        }}
        onCancel={() => setLogoutConfirm(false)}
        title="退出登录"
        message="确定要退出登录吗？"
        confirmLabel="退出"
        cancelLabel="取消"
      />
    </>
  );
}
