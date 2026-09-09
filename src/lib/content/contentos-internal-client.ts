/**
 * Portal → ContentOS 内部查询客户端（对账方向，设计 §12.5）。
 * 使用两仓库共享的 CONTENT_USAGE_CALLBACK_SECRET（D8）。
 */

const CONTENT_URL = () => process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4003';
const REQUEST_TIMEOUT_MS = 5_000;

export type WorkflowLookupResult =
  | { found: false }
  | { found: true; usageStatus: string; workflowStatus: string }
  | { found: false; unavailable: true };

export async function lookupWorkflowByOperation(
  operationId: string,
): Promise<WorkflowLookupResult> {
  const secret = process.env.CONTENT_USAGE_CALLBACK_SECRET;
  if (!secret) {
    return { found: false, unavailable: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${CONTENT_URL()}/api/internal/content-workflows/by-operation/${encodeURIComponent(operationId)}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        signal: controller.signal,
        cache: 'no-store',
      },
    );
    if (res.status === 404) return { found: false };
    if (!res.ok) return { found: false, unavailable: true };
    const body = (await res.json().catch(() => null)) as
      | { data?: { usageStatus?: string; status?: string } }
      | null;
    if (!body?.data?.usageStatus) return { found: false, unavailable: true };
    return {
      found: true,
      usageStatus: body.data.usageStatus,
      workflowStatus: body.data.status ?? 'unknown',
    };
  } catch {
    return { found: false, unavailable: true };
  } finally {
    clearTimeout(timer);
  }
}
