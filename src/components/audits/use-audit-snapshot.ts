"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getCompletedAudits,
  resolveSelectedAuditId,
  type SelectableAudit,
} from "@/lib/visibility/audit-selection";

type AuditPayload = SelectableAudit[] | { audits?: SelectableAudit[] };

export function useAuditSnapshot(projectId: string | null) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [auditPayload, setAuditPayload] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setAuditPayload(null);
      setLoading(false);
      setError(false);
      setLocked(false);
      return;
    }

    const controller = new AbortController();
    setAuditPayload(null);
    setLoading(true);
    setError(false);
    setLocked(false);
    fetch(`/api/integration/audits?projectId=${projectId}`, {
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (response.status === 403) {
          setLocked(true);
          return;
        }
        if (!response.ok) throw new Error("Failed to fetch audits");
        setAuditPayload(await response.json() as AuditPayload);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [projectId]);

  const audits = useMemo(() => getCompletedAudits(auditPayload), [auditPayload]);
  const selectedAuditId = resolveSelectedAuditId(audits, searchParams.get("auditId"));
  const latestAuditId = audits[0]?.id ?? null;

  const selectAudit = useCallback((auditId: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("auditId", String(auditId));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  return {
    audits,
    loading,
    error,
    locked,
    selectedAuditId,
    latestAuditId,
    isLatestAudit: selectedAuditId !== null && selectedAuditId === latestAuditId,
    selectAudit,
  };
}
