"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";

const tabs = [
  { label: "工作区", href: "/settings/workspace" },
  { label: "账号", href: "/settings/account" },
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
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="设置"
        subtitle="管理工作区、账号、品牌和订阅。"
      />

      <div className="dashboard-surface p-1">
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  background: active ? "var(--bg-card)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
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
      </div>

      {children}
    </div>
  );
}
