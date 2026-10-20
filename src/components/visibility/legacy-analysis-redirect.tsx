"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CitationViewId } from "./citation-prototype-views";

function RedirectContent({ view }: { view: CitationViewId }) {
  const router = useRouter();
  const search = useSearchParams();
  useEffect(() => {
    const params = new URLSearchParams(search.toString());
    params.set("view", view);
    router.replace("/intelligence?" + params.toString());
  }, [router, search, view]);
  return <p role="status">正在进入{view === "measurements" ? "行动效果复测" : "审计分析工作台"}…</p>;
}

export function LegacyAnalysisRedirect({ view }: { view: CitationViewId }) {
  return <Suspense fallback={<p>正在打开审计分析…</p>}><RedirectContent view={view} /></Suspense>;
}
