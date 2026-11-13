/**
 * 网络层：封装 wx.request，统一鉴权头、错误结构与时序控制。
 *
 * 鉴权头（按需附加）：
 * - X-Visitor-Token  匿名访客令牌
 * - Authorization     Bearer <sessionToken>（已登录会话）
 * - X-Binding-Token   短信/配对绑定流程的中间令牌
 * - Idempotency-Key   幂等键（提交体检、品牌评估等写操作）
 *
 * 错误约定：业务错误响应体为 { code, error }，这里统一抛 ApiError。
 * 域名白名单：只请求 utils/config.ts 登记的 origin，其余一律拒绝。
 */

import { apiUrl, isAllowedApiUrl } from './config';
import { readString, StorageKeys } from './storage';

export interface ApiErrorBody {
  code: string;
  error: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  /** 网络/超时类错误建议允许重试。 */
  readonly retryable: boolean;

  constructor(httpStatus: number, body: ApiErrorBody | undefined, networkMessage?: string) {
    super((body && body.error) || networkMessage || '请求失败，请稍后重试');
    this.name = 'ApiError';
    this.httpStatus = httpStatus;
    this.code = (body && body.code) || 'network_error';
    this.retryable = httpStatus === 0 || httpStatus >= 500 || httpStatus === 429;
  }
}

export type AuthScope = 'none' | 'visitor' | 'session' | 'binding';

export interface RequestOptions<TBody = unknown> {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  data?: TBody;
  auth?: AuthScope;
  /** 写操作幂等键，传入即附带 Idempotency-Key 头。 */
  idempotencyKey?: string;
  /** 允许在无令牌时静默降级（例如访客令牌尚未建立时预取）。 */
  allowMissingToken?: boolean;
  timeoutMs?: number;
}

/** 忽略过期响应：页面卸载/重新发起时旧的回调直接丢弃。 */
export class StaleGuard {
  private seq = 0;

  /** 开始一次新任务，返回本次的代次号。 */
  next(): number {
    this.seq += 1;
    return this.seq;
  }

  /** 代次号仍是最新时才为 true。 */
  isCurrent(token: number): boolean {
    return token === this.seq;
  }

  invalidate(): void {
    this.seq += 1;
  }
}

function buildHeader(options: RequestOptions): Record<string, string> {
  const header: Record<string, string> = { 'content-type': 'application/json' };
  if (options.idempotencyKey) header['Idempotency-Key'] = options.idempotencyKey;

  const scope = options.auth || 'visitor';
  if (scope === 'session') {
    const token = readString(StorageKeys.sessionToken);
    if (token) header['Authorization'] = 'Bearer ' + token;
    const visitor = readString(StorageKeys.visitorToken);
    if (visitor) header['X-Visitor-Token'] = visitor;
  } else if (scope === 'binding') {
    const token = readString(StorageKeys.bindingToken);
    if (token) header['X-Binding-Token'] = token;
    const visitor = readString(StorageKeys.visitorToken);
    if (visitor) header['X-Visitor-Token'] = visitor;
  } else if (scope === 'visitor') {
    const token = readString(StorageKeys.visitorToken);
    if (token) header['X-Visitor-Token'] = token;
  }
  return header;
}

/**
 * 发起一次接口请求。
 *
 * `missingToken`：要求 visitor/session/binding 令牌但本地没有时抛出，
 * 调用方应先确保令牌存在（见 visitor.ts / auth.ts 的 bootstrap）。
 */
export function request<TRes = unknown, TBody = unknown>(options: RequestOptions<TBody>): Promise<TRes> {
  const url = apiUrl(options.path);
  if (!isAllowedApiUrl(url)) {
    return Promise.reject(new ApiError(0, { code: 'origin_not_allowed', error: '接口域名不在已配置白名单内' }));
  }

  const scope = options.auth || 'visitor';
  if (!options.allowMissingToken && scope !== 'none' && !readString(scopeKey(scope))) {
    return Promise.reject(new ApiError(0, { code: 'missing_token', error: '登录信息缺失，请稍后重试' }));
  }

  return new Promise<TRes>((resolve, reject) => {
    wx.request<TBody, TRes | ApiErrorBody>({
      url,
      method: options.method || 'GET',
      data: options.data,
      header: buildHeader(options),
      timeout: options.timeoutMs || 15000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as TRes);
          return;
        }
        const body = res.data as ApiErrorBody | undefined;
        if (body && typeof body.code === 'string' && typeof body.error === 'string') {
          reject(new ApiError(res.statusCode, body));
        } else {
          reject(new ApiError(res.statusCode, undefined, '服务暂不可用（' + res.statusCode + '）'));
        }
      },
      fail: (err) => {
        reject(new ApiError(0, undefined, networkHint(err.errMsg)));
      }
    });
  });
}

function scopeKey(scope: AuthScope): string {
  if (scope === 'session') return StorageKeys.sessionToken;
  if (scope === 'binding') return StorageKeys.bindingToken;
  return StorageKeys.visitorToken;
}

function networkHint(errMsg: string): string {
  if (/timeout/i.test(errMsg)) return '请求超时，请检查网络后重试';
  if (/domain/i.test(errMsg)) return '当前环境未信任接口域名（需在开发工具勾选「不校验合法域名」或配置域名白名单）';
  return '网络连接失败，请稍后重试';
}

/** 把任意抛出物格式化为用户可读文案。 */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return '操作失败，请稍后重试';
}
