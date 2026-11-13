/**
 * API 域名配置。
 *
 * - 正式环境固定为 https://genilink.cn（微信后台需将该域名加入
 *   request 合法域名；真机预览/体验版受域名白名单约束）。
 * - 开发环境可在「我的」页切换（写入本地存储），切换后立即生效，
 *   便于联调本机或测试环境网关。
 * - 所有网络请求仅允许访问这里登记的域名（见 utils/request.ts 的
 *   origin 校验），不会向其它主机发起请求。
 */

export interface ApiOrigin {
  key: string;
  label: string;
  baseUrl: string;
}

export const API_ORIGINS: ApiOrigin[] = [
  { key: 'release', label: '正式环境（genilink.cn）', baseUrl: 'https://genilink.cn' },
  { key: 'dev', label: '开发联调（本地网关）', baseUrl: 'http://127.0.0.1:3001' }
];

/** 小程序内所有后端接口统一的路径前缀。 */
export const API_BASE_PATH = '/api/mini-program/v1';

/** 网页端「电脑继续查看」的引导地址。 */
export const WEB_CONTINUATION_URL = 'https://genilink.cn/quick-checks';

const STORAGE_KEY_API_ORIGIN = 'mp:api-origin';
const RELEASE_KEY = 'release';

export function releaseOrigin(): ApiOrigin {
  return API_ORIGINS[0];
}

/** 当前生效的 API origin：本地覆盖 > 正式环境。 */
export function currentApiOrigin(): ApiOrigin {
  if (!isDevelopmentBuild()) return releaseOrigin();
  const saved = wx.getStorageSync(STORAGE_KEY_API_ORIGIN);
  if (typeof saved === 'string' && saved !== RELEASE_KEY) {
    const found = API_ORIGINS.find((item) => item.key === saved);
    if (found) return found;
  }
  return releaseOrigin();
}

/** 仅允许切换到已登记的 origin，未知 key 一律回落正式环境。 */
export function setApiOriginKey(key: string): void {
  if (!isDevelopmentBuild()) return;
  if (key === RELEASE_KEY || API_ORIGINS.some((item) => item.key === key)) {
    wx.setStorageSync(STORAGE_KEY_API_ORIGIN, key);
  }
}

/** 拼接完整接口地址（不带头部斜杠的 path 也兼容）。 */
export function apiUrl(path: string): string {
  const origin = currentApiOrigin();
  const normalized = path.startsWith('/') ? path : '/' + path;
  return origin.baseUrl + API_BASE_PATH + normalized;
}

/** 校验 url 是否落在已配置的 API origin 白名单内。 */
export function isAllowedApiUrl(url: string): boolean {
  return url.startsWith(currentApiOrigin().baseUrl + API_BASE_PATH + '/');
}

export function isDevelopmentBuild() {
  return wx.getAccountInfoSync().miniProgram.envVersion === 'develop';
}

/** 隐私政策版本号（品牌评估提交时随请求上送）。 */
export const PRIVACY_VERSION = '2026-11-13';
