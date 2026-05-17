"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "工作区", href: "/settings/workspace" },
  { label: "账户", href: "/settings/account" },
  { label: "品牌", href: "/settings/brands" },
  { label: "提示词", href: "/settings/prompts" },
  { label: "订阅", href: "/settings/billing" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-sectionHeading)",
          }}
        >
          设置
        </h1>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-lg"
        style={{ background: "var(--bg-elevated)" }}
      >
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                background: active ? "var(--bg-card)" : "transparent",
                color: active
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                border: active ? "1px solid var(--border)" : "1px solid transparent",
                fontFamily: "var(--font-body)",
                textDecoration: "none",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
