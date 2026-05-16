"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import UpgradePrompt from "@/components/billing/upgrade-prompt";

export default function UpgradePage() {
  const searchParams = useSearchParams();
  const module = searchParams.get("module") as "visibility" | "content" | null;

  // Default to visibility if no module specified
  const targetModule = module === "content" ? "content" : "visibility";

  return (
    <div className="py-8">
      <div className="max-w-md mx-auto mb-6 text-center">
        <h1
          className="text-2xl font-semibold tracking-tight mb-2"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          升级订阅
        </h1>
        <p
          className="text-sm"
          style={{
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
          }}
        >
          解锁更多功能，提升你的AI搜索可见性
        </p>
      </div>

      <UpgradePrompt module={targetModule} />
    </div>
  );
}
