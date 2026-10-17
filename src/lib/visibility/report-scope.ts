import type { CitationReport } from '@/types/citation-report';
import type { CapabilityLevel } from '@/lib/billing/tiers';
import { scopeMeasurements } from './measurement-scope';

export function scopeCitationReport(report: CitationReport, level: CapabilityLevel, pending: boolean): CitationReport {
  const data = { ...report, context_sync_pending: pending, status: pending ? 'stale' : report.status, snapshot_current: report.snapshot_current && !pending, entitlementLevel: level };
  if (level !== 'basic') return { ...data, ...(data.measurements ? { measurements: { ...data.measurements, results: scopeMeasurements(data.measurements.results, !data.snapshot_current) } } : {}) };
  // Both online report and dashboard use the same whitelist for basic access.
  return { schema: data.schema, audit_id: data.audit_id, project_id: data.project_id, status: data.status,
    snapshot_current: data.snapshot_current, context_sync_pending: pending, entitlementLevel: level,
    run_id: data.run_id, revision: data.revision, finished_at: data.finished_at, coverage: data.coverage,
    platforms: data.platforms?.map(row => ({ platform: row.platform, samples: row.samples, metrics: [] })) };
}
