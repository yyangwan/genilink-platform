/**
 * ContentOS ContentBrief 服务间客户端（设计 §10.2-10.4）。
 *
 * 5 秒超时；创建/编辑在连接错误或超时时复用同一幂等键重试 1 次。
 * 错误透传 ContentOS 的 error.code，供 BFF 路由映射 HTTP 状态。
 */

const CONTENT_URL = () => process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4003';
const DEFAULT_TIMEOUT_MS = 5_000;

export class ContentOSBriefError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ContentOSBriefError';
  }
}

export interface ContentOSCallContext {
  projectId: string;
  serviceToken: string;
}

interface CallOptions {
  path: string;
  method?: string;
  body?: unknown;
  idempotencyKey?: string | null;
  serviceToken: string;
  projectId: string;
  timeoutMs?: number;
  /** 连接错误/超时时复用同一幂等键重试的次数（设计 §13.2：1 次）。 */
  retries?: number;
}

interface ContentOSResponse<T> {
  data?: T;
  meta?: { replayed?: boolean };
  error?: { code?: string; message?: string; param?: string };
  currentRevision?: number | null;
  [key: string]: unknown;
}

export interface BriefServiceResult<T> {
  data: T;
  replayed: boolean;
  currentRevision?: number | null;
}

async function callOnce<T>(opts: CallOptions): Promise<{ status: number; body: ContentOSResponse<T> }> {
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
    const body = (await res.json().catch(() => ({}))) as ContentOSResponse<T>;
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function call<T>(opts: CallOptions): Promise<{ status: number; body: ContentOSResponse<T> }> {
  const retries = opts.retries ?? 0;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callOnce<T>(opts);
    } catch (err) {
      lastError = err;
      // 仅连接错误/超时重试；4xx/5xx 响应不重试。
    }
  }
  throw new ContentOSBriefError(503, 'CONTENT_SERVICE_UNAVAILABLE', '智创服务暂不可用，请稍后重试', {
    cause: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

function unwrap<T>(
  result: { status: number; body: ContentOSResponse<T> },
  context: string,
): BriefServiceResult<T> {
  const { status, body } = result;
  if (status >= 200 && status < 300 && body.data !== undefined) {
    return {
      data: body.data,
      replayed: body.meta?.replayed === true,
      ...(body.currentRevision !== undefined ? { currentRevision: body.currentRevision } : {}),
    };
  }
  throw new ContentOSBriefError(
    status,
    body.error?.code ?? `CONTENTOS_${status}`,
    body.error?.message ?? `智创服务请求失败（${context}）`,
    body.error?.param ? { param: body.error.param } : body.currentRevision !== undefined ? { currentRevision: body.currentRevision } : undefined,
  );
}

export interface CreateBriefFromSnapshotInput {
  sourceSnapshot: unknown;
  projectSnapshot: unknown;
  suggestionRef?: { reportId?: string; auditId?: string };
}

export async function createBriefFromSnapshot<T = unknown>(
  ctx: ContentOSCallContext,
  input: CreateBriefFromSnapshotInput,
  idempotencyKey: string,
): Promise<BriefServiceResult<T>> {
  const result = await call<T>({
    path: '/api/content-briefs',
    method: 'POST',
    body: input,
    idempotencyKey,
    serviceToken: ctx.serviceToken,
    projectId: ctx.projectId,
    retries: 1,
  });
  return unwrap(result, '创建创作方案');
}

export async function getBrief<T = unknown>(
  ctx: ContentOSCallContext,
  briefId: string,
): Promise<BriefServiceResult<T>> {
  const result = await call<T>({
    path: `/api/content-briefs/${encodeURIComponent(briefId)}`,
    serviceToken: ctx.serviceToken,
    projectId: ctx.projectId,
  });
  return unwrap(result, '读取创作方案');
}

export async function patchBrief<T = unknown>(
  ctx: ContentOSCallContext,
  briefId: string,
  body: unknown,
  idempotencyKey: string,
): Promise<BriefServiceResult<T>> {
  const result = await call<T>({
    path: `/api/content-briefs/${encodeURIComponent(briefId)}`,
    method: 'PATCH',
    body,
    idempotencyKey,
    serviceToken: ctx.serviceToken,
    projectId: ctx.projectId,
    retries: 1,
  });
  return unwrap(result, '更新创作方案');
}

/** 判断错误是否为确定性的 4xx（对账语义：可安全释放/可提示用户修改）。 */
export function isDefiniteRejection(err: unknown): err is ContentOSBriefError {
  return err instanceof ContentOSBriefError && err.status >= 400 && err.status < 500;
}
