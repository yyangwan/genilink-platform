"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Eye, PenTool, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: TabItem[] = [
  { label: "工作台", href: "/dashboard", icon: LayoutDashboard },
  { label: "智見", href: "/visibility", icon: Eye },
  { label: "智創", href: "/content", icon: PenTool },
  { label: "更多", href: "/settings/workspace", icon: MoreHorizontal },
];

/**
 * Bottom tab bar for mobile viewports (< 640px).
 * Hidden on tablet and desktop via CSS.
 */
export function MobileTabBar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    if (href === "/settings/workspace") {
      return pathname.startsWith("/settings");
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around sm:hidden"
      style={{
        height: "56px",
        background: "var(--bg-card)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      role="tablist"
      aria-label="主导航"
    >
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 h-full",
              "transition-colors duration-[var(--duration-short)]"
            )}
            style={{
              color: active ? "var(--color-primary)" : "var(--text-muted)",
            }}
            role="tab"
            aria-selected={active}
            aria-label={tab.label}
          >
            <Icon className="w-5 h-5" />
            <span
              className="text-[10px] font-medium leading-none"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
