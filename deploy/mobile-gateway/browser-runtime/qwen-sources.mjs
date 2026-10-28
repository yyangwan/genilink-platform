// Evaluated in Chrome: only read the latest answer and its matching source panel.
export function readQwenSources() {
  const markdown = [...document.querySelectorAll('.qk-markdown-react')].at(-1);
  let region = markdown?.parentElement;
  while (region && region !== document.body && !region.querySelector('[id^="reference-link-anchor-"]') &&
    !/已完成(?:分析|思考).*参考/s.test(region.textContent || '')) {
    region = region.parentElement;
  }
  if (region === document.body) region = markdown?.parentElement;
  const wrapper = region?.querySelector('[id^="reference-link-anchor-"]');
  const requestId = wrapper?.id.replace('reference-link-anchor-', '');
  const sourceCountMatch = wrapper?.textContent.match(/(\d+)\s*篇来源/);
  const sourceCount = Number(sourceCountMatch?.[1]);
  const cards = requestId ? [...document.querySelectorAll('[data-c="refer_panel"][data-d="card"]')]
    .filter(card => card.id.startsWith(`deep-think-source-card-${requestId}-`)) : [];
  const records = cards.map(card => {
    let metadata = {};
    for (const attribute of ['data-click-extra', 'data-log-params', 'data-exposure-extra']) {
      try { metadata = JSON.parse(card.getAttribute(attribute)); } catch { continue; }
      if (metadata?.req_id === requestId && (metadata.ref_url || metadata.url || metadata.title)) break;
      metadata = {};
    }
    const url = metadata?.ref_url || metadata?.url || '';
    let siteName = '';
    try { siteName = new URL(url).hostname; } catch {}
    return {index: Number(card.id.slice(`deep-think-source-card-${requestId}-`.length)),
      url, title: metadata?.title || card.textContent?.trim() || '', siteName,
      kind: metadata?.req_id === requestId ? 'answer_reference' : 'unknown'};
  });
  const referenceTexts = [...(region || markdown?.parentElement || document).querySelectorAll('span')]
    .map(span => span.textContent || '');
  const declaredCounts = referenceTexts.map(text => text.match(/共参考\s*(\d+)\s*篇资料/) || text.match(/(\d+)\s*篇来源/))
    .filter(Boolean).map(match => Number(match[1]));
  const fallbackCount = Math.max(0, ...declaredCounts);
  const inlineLinks = [...(markdown?.querySelectorAll('a[href]') || [])]
    .map(anchor => ({url: anchor.href, title: anchor.innerText || anchor.textContent, siteName: anchor.hostname, kind: 'text_link'}));
  return {answer: markdown?.innerText ?? markdown?.textContent ?? '', requestId,
    referenceCount: Number.isFinite(sourceCount) ? sourceCount : fallbackCount,
    referenceCountKnown: Boolean(sourceCountMatch) || declaredCounts.length > 0,
    records, links: wrapper ? records : inlineLinks};
}

export async function collectQwenSources(page, {timeoutMs = 30_000} = {}) {
  let snapshot = await page.evaluate(readQwenSources);
  if (!snapshot.requestId) return snapshot;
  if (!snapshot.records.length) {
    await page.locator(`[id="reference-link-anchor-${snapshot.requestId}"]`).click();
  }
  const requestId = snapshot.requestId;
  const records = new Map(snapshot.records.map(record => [record.index,record]));
  const deadline = Date.now() + Math.min(30_000,Math.max(0,Number(timeoutMs) || 0));
  do {
    snapshot = await page.evaluate(readQwenSources);
    if (snapshot.requestId !== requestId) throw new Error('QWEN_SOURCE_PANEL_CHANGED: latest answer changed while reading its sources');
    for (const record of snapshot.records) records.set(record.index, record);
    if (snapshot.referenceCountKnown !== false && records.size >= snapshot.referenceCount && [...records.values()].every(record => record.url)) break;
    if (Date.now() >= deadline) break;
    await page.evaluate(requestId => {
      const card = [...document.querySelectorAll('[data-c="refer_panel"][data-d="card"]')]
        .find(element => element.id.startsWith(`deep-think-source-card-${requestId}-`));
      let container = card?.parentElement;
      while (container && container !== document.body) {
        if (container.scrollHeight > container.clientHeight && /auto|scroll/.test(getComputedStyle(container).overflowY)) {
          container.scrollTop += Math.max(200, container.clientHeight * 0.8);
          break;
        }
        container = container.parentElement;
      }
    }, snapshot.requestId);
    await page.waitForTimeout(300);
  } while (Date.now() < deadline);
  snapshot.links = [...records.values()].sort((a,b) => a.index-b.index);
  const complete = snapshot.links.length === snapshot.referenceCount && !snapshot.links.some((record,index) => record.index !== index+1 || !record.url);
  snapshot.sourcePanelStatus = snapshot.referenceCountKnown === true ? (complete ? 'complete' : 'partial') : 'unknown';
  return snapshot;
}
