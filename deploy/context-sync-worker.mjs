// One scheduler invocation. Configure secrets in the runtime environment, never command arguments.
const secret = process.env.VISIBILITY_CONTEXT_SYNC_SECRET;
const origin = process.env.VISIBILITY_CONTEXT_SYNC_ORIGIN || 'http://127.0.0.1';
if (!secret) { console.error('Context sync secret is not configured'); process.exit(1); }
try {
  const response = await fetch(`${origin.replace(/\/$/, '')}/api/internal/visibility/context-sync`, {
    method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) throw new Error(`Context sync HTTP ${response.status}`);
  const payload = await response.json();
  console.log(`Context sync processed ${Array.isArray(payload.results) ? payload.results.length : 0} projects`);
} catch (error) { console.error(error instanceof Error && /^Context sync HTTP \d+$/.test(error.message) ? error.message : 'Context sync request failed'); process.exit(1); }
