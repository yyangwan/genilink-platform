type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawRecord) : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const str = stringValue(value);
    if (str) return str;
  }
  return '';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapTimeline(value: unknown): { week: string; tasks: string[] }[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        return { week: `Week ${index + 1}`, tasks: [item] };
      }

      const record = asRecord(item);
      const tasks = stringArray(record.tasks);
      const task = stringValue(record.task);
      return {
        week: firstString(record.week, `Week ${index + 1}`),
        tasks: tasks.length > 0 ? tasks : task ? [task] : [],
      };
    })
    .filter((item) => item.tasks.length > 0);
}

function mapAuditEvidence(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      const record = asRecord(item);
      return {
        platform: stringValue(record.platform),
        prompt: stringValue(record.prompt),
        finding: stringValue(record.finding),
      };
    })
    .filter((item) => (typeof item === 'string' ? item.length > 0 : item.finding || item.prompt || item.platform));
}

export function mapSuggestion(s: RawRecord) {
  const detail = asRecord(s.detail);
  const targetPlatforms = stringArray(detail.target_platforms);
  const evidenceChannels = stringArray(detail.evidence_channels);
  const evidenceSources = stringArray(detail.evidence_sources);
  const actionChannels = stringArray(detail.action_channels);
  const actionSources = stringArray(detail.action_sources);
  const actionType = stringValue(detail.action_type);
  const outline = detail.content_outline ?? detail.outline;

  return {
    id: String(s.id),
    report_id: numberValue(s.report_id),
    audit_id: numberValue(s.audit_id),
    text: firstString(s.title, detail.evidence_summary, s.description),
    description: stringValue(s.description),
    category: stringValue(s.category),
    platform: firstString(detail.platform, targetPlatforms[0]),
    priority: firstString(s.priority, 'medium'),
    status: s.is_resolved ? 'resolved' : 'pending',
    evidence_sources: evidenceSources,
    evidence_channels: evidenceChannels,
    action_sources: actionSources,
    action_channels: actionChannels,
    action_type: actionType,
    type_tags: stringArray(detail.type_tags),
    keywords: stringArray(detail.keywords),
    content_outline: Array.isArray(outline) ? stringArray(outline).join('\n') : stringValue(outline),
    weekly_tasks: mapTimeline(detail.weekly_tasks ?? detail.timeline),
    competitor_reference: firstString(detail.competitor_reference, detail.competitor_ref),
    expected_result: firstString(detail.expected_result, detail.expected_outcome),
    evidence_summary: stringValue(detail.evidence_summary),
    audit_findings: stringArray(detail.audit_findings),
    success_metric: stringValue(detail.success_metric),
    audit_evidence: mapAuditEvidence(detail.audit_evidence),
    acceptance_criteria: stringArray(detail.acceptance_criteria),
    measurement_plan: stringValue(detail.measurement_plan),
  };
}
