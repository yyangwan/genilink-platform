export function extractQwenResult(snapshot) {
  const answer = String(snapshot.answer || '').trim();
  const seen = new Set();
  const sources = [];
  for (const candidate of snapshot.links || []) {
    let url;
    try {
      url = new URL(candidate.url);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) continue;
    if (/(^|\.)qianwen\.com$/i.test(url.hostname)) continue;
    const key = url.href;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      index: sources.length + 1,
      title: String(candidate.title || '').trim(),
      site_name: String(candidate.siteName || '').trim(),
      page_title: null,
      domain: url.hostname.toLowerCase(),
      url: url.href,
      raw_url: candidate.url,
      url_resolution: 'exact',
      status: 'collected',
      error_message: null,
    });
  }
  const referenceCount = Math.max(Number(snapshot.referenceCount) || 0, sources.length);
  return {
    platform: 'qwen',
    surface: 'web',
    answer,
    reference_count: referenceCount,
    source_count: sources.length,
    source_success_count: sources.length,
    source_failure_count: Math.max(0, referenceCount - sources.length),
    source_completeness: referenceCount ? Math.min(1, sources.length / referenceCount) : 1,
    capture_status: !answer ? 'answer_only' : sources.length === referenceCount ? 'complete' : sources.length ? 'partial' : 'answer_only',
    sources,
    answer_urls: [],
    source_collection_duration_ms: snapshot.sourceCollectionDurationMs || 0,
  };
}
