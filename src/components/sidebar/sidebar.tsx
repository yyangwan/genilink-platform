"use client";
/* eslint-disable react-hooks/set-state-in-effect */

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
  Play,
  FileText,
  Clock,
  Lightbulb,
  TrendingUp,
  GitCompareArrows,
  PlusCircle,
  List,
  LayoutList,
  Calendar,
  BarChart3,
  Sparkles,
  Mic,
  LayoutTemplate,
  Plug,
  Tag,
  Target,
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
  { label: "¹¤×÷Ì¨", href: "/dashboard", icon: LayoutDashboard },
  { label: "é¡¹ç›®ç®¡ç†", href: "/projects", icon: FolderKanban },
  { label: "å“ç‰Œç®¡ç†", href: "/brands", icon: Tag },
];

const zhijianSection: NavSection = {
  id: "zhijian",
  label: "æ™ºè¦‹",
  icon: Eye,
  items: [
    { label: "¿É¼ûĞÔ·ÖÎö", href: "/visibility", icon: Play },
    { label: "å®¡è®¡è®°å½•", href: "/audits", icon: FileText },
    { label: "å®šæ—¶ä»»åŠ¡", href: "/schedules", icon: Clock },
    { label: "ä¼˜åŒ–å»ºè®®", href: "/suggestions", icon: Lightbulb },
    { label: "è¶‹åŠ¿åˆ†æ", href: "/trends", icon: TrendingUp },
    { label: "ç«å“å¯¹æ¯”", href: "/compare", icon: GitCompareArrows },
    { label: "å†…å®¹æ´å¯Ÿ", href: "/insights", icon: BarChart3 },
    { label: "æˆ˜ç•¥æ™ºèƒ½", href: "/strategic", icon: Target },
  ],
};

const zhichuangSection: NavSection = {
  id: "zhichuang",
  label: "æ™ºå‰µ",
  icon: PenTool,
  items: [
    { label: "å†…å®¹æ¦‚è§ˆ", href: "/content", icon: LayoutList },
    { label: "å†…å®¹åˆ—è¡¨", href: "/content/list", icon: List },
    { label: "åˆ›å»ºå†…å®¹", href: "/content/new", icon: PlusCircle },
    { label: "å†…å®¹æ—¥å†", href: "/content/calendar", icon: Calendar },
    { label: "å†…å®¹æ´å¯Ÿ", href: "/content/insights", icon: BarChart3 },
    { label: "æ™ºçµ", href: "/content/genie", icon: Sparkles },
    { label: "å“ç‰Œå£°éŸ³", href: "/content/brand-voices", icon: Mic },
    { label: "å†…å®¹æ¨¡æ¿", href: "/content/templates", icon: LayoutTemplate },
    { label: "å¹³å°é…ç½®", href: "/content/settings", icon: Plug },
  ],
};

const bottomItems: NavItem[] = [
  { label: "è®¾ç½®", href: "/settings", icon: Settings },
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
  const [accordion, setAccordion] = useState<Record<string, boolean>>({});

  // Load accordion state from localStorage
  useEffect(() => {
    setAccordion(getAccordionState());
  }, []);

  // Auto-expand æ™ºè¦‹ if current route is a æ™ºè¦‹ page
  useEffect(() => {
    const isZhijianRoute = zhijianSection.items.some((item) => pathname.startsWith(item.href));
    if (isZhijianRoute && !accordion[zhijianSection.id]) {
      setAccordion((prev) => {
        const next = { ...prev, [zhijianSection.id]: true };
        saveAccordionState(next);
        return next;
      });
    }
  }, [pathname]);

  // Auto-expand æ™ºå‰µ if current route is a æ™ºå‰µ page
  useEffect(() => {
    const isZhichuangRoute = pathname.startsWith("/content");
    if (isZhichuangRoute && !accordion[zhichuangSection.id]) {
      setAccordion((prev) => {
        const next = { ...prev, [zhichuangSection.id]: true };
        saveAccordionState(next);
        return next;
      });
    }
  }, [pathname]);

  const toggleAccordion = (sectionId: string) => {
    setAccordion((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      saveAccordionState(next);
      return next;
    });
  };

  // Fetch workspace name on mount
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

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0];
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
      if (href === "/content") return pathname === "/content";
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
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all relative",
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
            æ™?
          </div>
          <span
            className="text-base font-semibold tracking-tight"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            æ™ºé“¾
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

      {/* Workspace label */}
      <div className="px-3 mb-2">
        <div
          className="px-3 py-2 text-xs font-medium tracking-wider"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
        >
          {currentWorkspace?.name || "¹¤×÷Çø"}
        </div>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto" aria-label="Ö÷µ¼º½">
        {/* Top items */}
        {topItems.map(navLink)}

        {/* Divider */}
        <div className="my-2" style={{ borderTop: "1px solid var(--border)" }} />

        {/* æ™ºè¦‹ accordion section */}
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
              accordion[zhijianSection.id] ? "max-h-[480px] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="pl-4 space-y-0.5">
              {zhijianSection.items.map((item) => navLink(item))}
            </div>
          </div>
        </div>

        {/* æ™ºå‰µ accordion section */}
        <div>
          <button
            onClick={() => toggleAccordion(zhichuangSection.id)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-all"
            style={{
              color: isSectionActive(zhichuangSection) ? "var(--text-primary)" : "var(--text-secondary)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-display)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            aria-expanded={accordion[zhichuangSection.id]}
          >
            <div className="flex items-center gap-3">
              <PenTool className="w-[18px] h-[18px] shrink-0" />
              <span className="text-xs font-medium uppercase tracking-wider">{zhichuangSection.label}</span>
            </div>
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform shrink-0 duration-[var(--duration-medium)]",
                accordion[zhichuangSection.id] && "rotate-180"
              )}
            />
          </button>

          {/* Collapsible children â€?grouped with sub-dividers */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-[var(--duration-medium)]",
              accordion[zhichuangSection.id] ? "max-h-[480px] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="pl-4 space-y-0.5">
              {/* Core workflow */}
              {zhichuangSection.items.slice(0, 3).map((item) => navLink(item))}

              {/* Sub-divider: Analytics & Planning */}
              <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
                <div className="flex-1" style={{ borderTop: "1px solid var(--border)" }} />
                <span
                  className="text-[10px] font-medium uppercase tracking-wider shrink-0"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
                >
                  åˆ†æè§„åˆ’
                </span>
                <div className="flex-1" style={{ borderTop: "1px solid var(--border)" }} />
              </div>
              {zhichuangSection.items.slice(3, 6).map((item) => navLink(item))}

              {/* Sub-divider: Configuration */}
              <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
                <div className="flex-1" style={{ borderTop: "1px solid var(--border)" }} />
                <span
                  className="text-[10px] font-medium uppercase tracking-wider shrink-0"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
                >
                  é…ç½®ç®¡ç†
                </span>
                <div className="flex-1" style={{ borderTop: "1px solid var(--border)" }} />
              </div>
              {zhichuangSection.items.slice(6, 9).map((item) => navLink(item))}
            </div>
          </div>
        </div>

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
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
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
          <span>ÍË³öµÇÂ¼</span>
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
          "hidden lg:flex flex-col fixed top-0 left-0 h-full z-[100]",
          "transition-transform duration-[var(--duration-medium)]"
        )}
        style={{
          width: SIDEBAR_WIDTH,
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
        }}
        role="navigation"
        aria-label="²à±ßÀ¸µ¼º½"
      >
        {sidebarContent}
      </aside>

      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-[100] block lg:hidden",
          "transition-transform duration-[var(--duration-medium)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          width: SIDEBAR_WIDTH,
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
        }}
        role="navigation"
        aria-label="²à±ßÀ¸µ¼º½"
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
        title="ÍË³öµÇÂ¼"
        message="È·¶¨ÒªÍË³öµÇÂ¼Âğ£¿"
        confirmLabel="ÍË³ö"
        cancelLabel="å–æ¶ˆ"
      />
    </>
  );
}













