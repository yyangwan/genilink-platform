"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import UpgradePrompt from "@/components/billing/upgrade-prompt";

export default function UpgradePage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen"
          style={{ backgroundColor: "var(--bg-base)" }}
        />
      }
    >
      <UpgradeContent />
    </Suspense>
  );
}

function UpgradeContent() {
  const searchParams = useSearchParams();
  const moduleParam = searchParams.get("module") as "visibility" | "content" | null;
  const targetModule = moduleParam === "content" ? "content" : "visibility";

  return (
    <div className="py-8">
      <div className="mx-auto mb-6 max-w-md text-center">
        <h1
          className="mb-2 text-2xl font-semibold tracking-tight"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          订阅升级
        </h1>
        <p
          className="text-sm"
          style={{
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
          }}
        >
          开通对应模块后，可以继续使用被拦截的功能。
        </p>
      </div>

      <UpgradePrompt module={targetModule} />
    </div>
  );
}
