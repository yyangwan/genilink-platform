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
  const sourceCount = Number(wrapper?.textContent.match(/(\d+)\s*篇来源/)?.[1]);
  const cards = requestId ? [...document.querySelectorAll('[data-c="refer_panel"][data-d="card"]')]
    .filter(card => card.id.startsWith(`deep-think-source-card-${requestId}-`)) : [];
  const records = cards.map(card => {
    let metadata = {};
    for (const attribute of ['data-click-extra', 'data-log-params', 'data-exposure-extra']) {
      try { metadata = JSON.parse(card.getAttribute(attribute)); } catch { continue; }
      if (metadata?.req_id === requestId && (metadata.ref_url || metadata.url)) break;
      metadata = {};
    }
    const url = metadata?.ref_url || metadata?.url || '';
    let siteName = '';
    try { siteName = new URL(url).hostname; } catch {}
    return {index: Number(card.id.slice(`deep-think-source-card-${requestId}-`.length)),
      url, title: metadata?.title || '', siteName};
  });
  const referenceTexts = [...(region || markdown?.parentElement || document).querySelectorAll('span')]
    .map(span => span.textContent || '');
  const fallbackCount = Math.max(0, ...referenceTexts.map(text => Number(
    text.match(/共参考\s*(\d+)\s*篇资料/)?.[1] || text.match(/(\d+)\s*篇来源/)?.[1] || 0)));
  const inlineLinks = [...(region || markdown?.parentElement || document).querySelectorAll('a[href]')]
    .map(anchor => ({url: anchor.href, title: anchor.innerText, siteName: anchor.hostname}));
  return {answer: markdown?.innerText || '', requestId,
    referenceCount: Number.isFinite(sourceCount) ? sourceCount : fallbackCount,
    records, links: wrapper ? records : inlineLinks};
}

export async function collectQwenSources(page) {
  let snapshot = await page.evaluate(readQwenSources);
  if (!snapshot.requestId) return snapshot;
  if (!snapshot.records.length) {
    await page.locator(`[id="reference-link-anchor-${snapshot.requestId}"]`).click();
  }
  const records = new Map();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    snapshot = await page.evaluate(readQwenSources);
    for (const record of snapshot.records) records.set(record.index, record);
    if (records.size >= snapshot.referenceCount && [...records.values()].every(record => record.url)) break;
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
  }
  snapshot.links = [...records.values()].sort((a,b) => a.index-b.index);
  if (snapshot.links.length !== snapshot.referenceCount || snapshot.links.some((record,index) => record.index !== index+1 || !record.url)) {
    throw new Error(`QWEN_SOURCE_PANEL_INCOMPLETE: ${snapshot.links.filter(record => record.url).length}/${snapshot.referenceCount}`);
  }
  return snapshot;
}
