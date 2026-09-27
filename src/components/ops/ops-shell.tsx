"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Target } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

const links = [
  { href: "/ops/conversion", label: "获客转化", icon: BarChart3 },
  { href: "/ops/leads", label: "合作线索", icon: Target },
];

export function OpsShell({
  children,
  userLabel,
}: {
  children: React.ReactNode;
  userLabel: string;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", fontFamily: "var(--font-body)" }}>
      <header className="border-b" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <BrandMark className="flex h-9 w-9 items-center justify-center rounded-lg [&_svg]:h-7 [&_svg]:w-7" signature />
            <div>
              <p className="text-base font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>智链内部运营</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>仅供平台运营人员使用</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="max-w-48 truncate" style={{ color: "var(--text-muted)" }} title={userLabel}>{userLabel}</span>
            <Link href="/dashboard" style={{ color: "var(--color-primary)" }}>返回产品工作台</Link>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6" aria-label="内部运营导航">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm", active ? "font-semibold" : "font-normal")}
                style={{
                  borderColor: active ? "var(--color-primary)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}
