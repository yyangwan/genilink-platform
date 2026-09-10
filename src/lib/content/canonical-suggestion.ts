/**
 * 规范建议 loader（设计 §7.1/§17.1）：
 * 服务端用当前 workspace + project 向智见重新读取建议，不信任浏览器回传的业务对象。
 *
 * 智见没有单条建议接口，fetch-all-then-find 是唯一途径；
 * suggestions/[id] 路由与 Brief 创建共用本函数，保证同一套映射与项目校验。
 */

import { issueVisibilityProjectJWT } from '@/lib/auth/service-jwt';
import { mapSuggestion } from '@/app/api/integration/suggestions/mapper';

const DEFAULT_VISIBILITY_URL = 'http://127.0.0.1:8000';

/** 设计 §13.2：Portal → Visibility 读取建议 5 秒超时，1 次重试（仅连接错误/5xx）。 */
const DEFAULT_TIMEOUT_MS = 5_000;

function visibilityBaseUrl(): string {
  return process.env.VISIBILITY_SERVICE_URL || DEFAULT_VISIBILITY_URL;
}

export type MappedSuggestion = ReturnType<typeof mapSuggestion>;

export interface CanonicalSuggestionIdentity {
  userId: string;
  email?: string | null;
  name?: string | null;
  role: string;
}

export type CanonicalSuggestionResult =
  | { ok: true; suggestion: MappedSuggestion }
  | { ok: false; code: 'SUGGESTION_NOT_FOUND' | 'VISIBILITY_UNAVAILABLE' };

type FetchOutcome =
  | { kind: 'data'; data: unknown }
  | { kind: 'not-found' }
  | { kind: 'retryable' }
  | { kind: 'unavailable' };

async function fetchProjectSuggestions(params: {
  serviceToken: string;
  projectId: string;
  timeoutMs: number;
}): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const res = await fetch(`${visibilityBaseUrl()}/api/suggestions/${encodeURIComponent(params.projectId)}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.serviceToken}`,
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (res.ok) {
      const text = await res.text();
      if (!text) return { kind: 'data', data: null };
      try {
        return { kind: 'data', data: JSON.parse(text) };
      } catch {
        return { kind: 'unavailable' };
      }
    }
    if (res.status === 404) return { kind: 'not-found' };
    if (res.status >= 500) return { kind: 'retryable' };
    // 401/403/其他 4xx：鉴权或配置问题，重试无意义。
    return { kind: 'unavailable' };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      // 超时不重试（设计 §13.2）。
      return { kind: 'unavailable' };
    }
    return { kind: 'retryable' };
  } finally {
    clearTimeout(timer);
  }
}

export async function loadCanonicalSuggestion(params: {
  identity: CanonicalSuggestionIdentity;
  workspaceId: string;
  projectId: string;
  suggestionId: string;
  timeoutMs?: number;
}): Promise<CanonicalSuggestionResult> {
  const { identity, workspaceId, projectId, timeoutMs = DEFAULT_TIMEOUT_MS } = params;
  const suggestionId = String(params.suggestionId ?? '').trim();
  if (!suggestionId) {
    return { ok: false, code: 'SUGGESTION_NOT_FOUND' };
  }

  const serviceToken = await issueVisibilityProjectJWT({
    userId: identity.userId,
    email: identity.email,
    name: identity.name,
    workspaceId,
    projectId,
    role: identity.role,
  });

  let outcome = await fetchProjectSuggestions({ serviceToken, projectId, timeoutMs });
  if (outcome.kind === 'retryable') {
    outcome = await fetchProjectSuggestions({ serviceToken, projectId, timeoutMs });
  }

  if (outcome.kind === 'data') {
    const list = Array.isArray(outcome.data) ? outcome.data : [];
    const raw = list.find(
      (item) => item && typeof item === 'object' && String((item as Record<string, unknown>).id) === suggestionId,
    );
    if (!raw) {
      return { ok: false, code: 'SUGGESTION_NOT_FOUND' };
    }
    return { ok: true, suggestion: mapSuggestion(raw as Record<string, unknown>) };
  }
  if (outcome.kind === 'not-found') {
    return { ok: false, code: 'SUGGESTION_NOT_FOUND' };
  }
  return { ok: false, code: 'VISIBILITY_UNAVAILABLE' };
}
