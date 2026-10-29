export function extractQwenResult(snapshot, {answerCompleted = false} = {}) {
  const answer = String(snapshot.answer || '').trim();
  const seen = new Set();
  const sources = [];
  for (const candidate of snapshot.links || []) {
    const kind = ['answer_reference','search_candidate','text_link'].includes(candidate.kind) ? candidate.kind : 'unknown';
    let url;
    try {
      url = new URL(candidate.url);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || /(^|\.)qianwen\.com$/i.test(url.hostname)) url = null;
    } catch { url = null; }
    if (!url && !(kind === 'answer_reference' && String(candidate.title || '').trim())) continue;
    const key = kind === 'answer_reference' && Number.isInteger(candidate.index) ? `card:${candidate.index}` : url?.href || `missing:${candidate.index}:${candidate.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      index: sources.length + 1,
      kind,
      title: String(candidate.title || '').trim(),
      site_name: String(candidate.siteName || '').trim(),
      page_title: null,
      domain: url?.hostname.toLowerCase() || null,
      url: url?.href || null,
      raw_url: candidate.url,
      url_resolution: url ? 'exact' : 'unavailable',
      status: url ? 'collected' : 'failed',
      error_message: url ? null : 'source_url_unavailable',
    });
  }
  const referenceCount = Math.max(Number(snapshot.referenceCount) || 0, sources.length);
  const validCount = sources.filter(source => source.url_resolution === 'exact').length;
  const declaredCount = snapshot.referenceCountKnown === true && Number.isInteger(snapshot.referenceCount) && snapshot.referenceCount >= sources.length ? snapshot.referenceCount : null;
  const panelStatus = !snapshot.requestId || declaredCount === null ? 'unknown' :
    snapshot.sourcePanelStatus === 'complete' && validCount === declaredCount ? 'complete' : 'partial';
  return {
    platform: 'qwen',
    surface: 'web',
    answer,
    answer_status: answer && answerCompleted === true ? 'complete' : 'partial',
    source_panel_status: panelStatus,
    source_panel_expected_count: declaredCount,
    reference_count: referenceCount,
    source_count: sources.length,
    source_success_count: validCount,
    source_failure_count: Math.max(0, referenceCount - validCount),
    source_completeness: referenceCount ? Math.min(1, validCount / referenceCount) : 1,
    capture_status: !answer ? 'answer_only' : validCount === referenceCount ? 'complete' : sources.length ? 'partial' : 'answer_only',
    sources,
    answer_urls: [],
    source_collection_duration_ms: snapshot.sourceCollectionDurationMs || 0,
  };
}
