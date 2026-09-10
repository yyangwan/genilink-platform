/**
 * ContentOS 内容工作流服务间客户端（设计 §10.5-10.7）。
 *
 * 5 秒超时；创建在连接错误/超时时复用同一幂等键重试 1 次。
 * 注意：重试后仍超时由调用方进入对账（pending_reconcile），不得释放预占。
 */

const CONTENT_URL = () => process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4003';
const DEFAULT_TIMEOUT_MS = 5_000;

export class ContentOSWorkflowError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extras?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ContentOSWorkflowError';
  }
}

export interface WorkflowCallContext {
  projectId: string;
  serviceToken: string;
}

export interface WorkflowPlatformView {
  platform: string;
  status: string;
  attemptCount?: number;
  error?: { code: string; message: string };
}

export interface WorkflowView {
  id: string;
  briefId: string;
  briefRevision: number;
  contentPieceId: string | null;
  status: string;
  platforms: WorkflowPlatformView[];
}

interface WorkflowResponse {
  data?: WorkflowView;
  meta?: { replayed?: boolean };
  error?: { code?: string; message?: string };
  currentRevision?: number | null;
}

export interface WorkflowServiceResult {
  data: WorkflowView;
  replayed: boolean;
}

async function callOnce(opts: {
  path: string;
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  serviceToken: string;
  projectId: string;
  timeoutMs?: number;
}): Promise<{ status: number; body: WorkflowResponse }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.serviceToken}`,
    'X-Genilink-Project-Id': opts.projectId,
  };
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  try {
    const res = await fetch(`${CONTENT_URL()}${opts.path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as WorkflowResponse;
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function call<T extends { status: number; body: WorkflowResponse }>(
  opts: Parameters<typeof callOnce>[0] & { retries?: number; ambiguous?: boolean },
): Promise<T> {
  const retries = opts.retries ?? 0;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return (await callOnce(opts)) as T;
    } catch (err) {
      lastError = err;
    }
  }
  // 网络错误/超时：结果不确定 → 由调用方对账（§7.3）。
  throw new ContentOSWorkflowError(
    0,
    'CONTENT_SERVICE_UNAVAILABLE',
    '智创服务暂不可用，请求结果确认中',
    { cause: lastError instanceof Error ? lastError.message : String(lastError) },
  );
}

function unwrap(result: { status: number; body: WorkflowResponse }, context: string): WorkflowServiceResult {
  const { status, body } = result;
  if (status >= 200 && status < 300 && body.data) {
    return { data: body.data, replayed: body.meta?.replayed === true };
  }
  throw new ContentOSWorkflowError(
    status,
    body.error?.code ?? `CONTENTOS_${status}`,
    body.error?.message ?? `智创服务请求失败（${context}）`,
    body.currentRevision !== undefined ? { currentRevision: body.currentRevision } : undefined,
  );
}

export async function createContentWorkflow(
  ctx: WorkflowCallContext,
  body: unknown,
  idempotencyKey: string,
): Promise<WorkflowServiceResult> {
  const result = await call({
    path: '/api/content-workflows',
    method: 'POST',
    body,
    idempotencyKey,
    serviceToken: ctx.serviceToken,
    projectId: ctx.projectId,
    retries: 1,
  });
  return unwrap(result, '创建内容工作流');
}

export async function getWorkflow(
  ctx: WorkflowCallContext,
  workflowId: string,
): Promise<WorkflowServiceResult> {
  const result = await call({
    path: `/api/content-workflows/${encodeURIComponent(workflowId)}`,
    serviceToken: ctx.serviceToken,
    projectId: ctx.projectId,
  });
  return unwrap(result, '查询工作流');
}

export async function retryPlatform(
  ctx: WorkflowCallContext,
  workflowId: string,
  platform: string,
  idempotencyKey: string,
): Promise<WorkflowServiceResult> {
  const result = await call({
    path: `/api/content-workflows/${encodeURIComponent(workflowId)}/platforms/${encodeURIComponent(platform)}/retry`,
    method: 'POST',
    idempotencyKey,
    serviceToken: ctx.serviceToken,
    projectId: ctx.projectId,
    retries: 1,
  });
  return unwrap(result, '重试平台生成');
}

/** 判断错误是否为确定性的 4xx 拒绝（可安全释放预占额度）。 */
export function isDefiniteRejection(err: unknown): err is ContentOSWorkflowError {
  return err instanceof ContentOSWorkflowError && err.status >= 400 && err.status < 500;
}
