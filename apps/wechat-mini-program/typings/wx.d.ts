/* eslint-disable @typescript-eslint/no-explicit-any -- Native Page objects permit arbitrary user-defined properties. */
/**
 * 本地 wx API 类型声明（仅覆盖本项目实际使用的子集）。
 *
 * 为什么自带声明：仓库约束不使用网络安装依赖，TypeScript + 这份声明
 * 即可在本地完成 `npx tsc --noEmit` 类型检查。
 * 如在开发机安装了官方 `miniprogram-api-typings`，可在 tsconfig 的
 * `types` 中引入并删除本目录，二者提供的全局类型等价。
 */

declare function App(options: {
  onLaunch?: (query: Record<string, string | undefined>) => void;
  onShow?: (query: Record<string, string | undefined>) => void;
  onHide?: () => void;
  onError?: (message: string) => void;
  [key: string]: any;
}): void;

declare function getApp<T = any>(): T;

declare function getCurrentPages(): Array<{
  route: string;
  options: Record<string, string | undefined>;
  setData(data: Record<string, any>): void;
}>;

interface PageOptions<D extends object> {
  data?: D;
  setData?(patch: Partial<D>, callback?: () => void): void;
  onLoad?(this: WechatMiniprogram.PageInstance<D>, query: Record<string, string | undefined>): void;
  onShow?(this: WechatMiniprogram.PageInstance<D>): void;
  onReady?(this: WechatMiniprogram.PageInstance<D>): void;
  onHide?(this: WechatMiniprogram.PageInstance<D>): void;
  onUnload?(this: WechatMiniprogram.PageInstance<D>): void;
  onPullDownRefresh?(this: WechatMiniprogram.PageInstance<D>): void;
  onReachBottom?(this: WechatMiniprogram.PageInstance<D>): void;
  onShareAppMessage?(this: WechatMiniprogram.PageInstance<D>): WechatMiniprogram.PageShareContent;
  [key: string]: any;
}

declare function Page<D extends object = Record<string, any>>(
  options: PageOptions<D> & ThisType<WechatMiniprogram.PageInstance<D>>
): void;

declare namespace WechatMiniprogram {
  interface PageInstance<D extends object> {
    data: D;
    setData(patch: Partial<D> | Record<string, any>, callback?: () => void): void;
    route: string;
    options: Record<string, string | undefined>;
    /** 页面自定义属性/方法（Page(options) 的 options 本身即页面实例）。 */
    [key: string]: any;
  }

  interface PageShareContent {
    title: string;
    path?: string;
    imageUrl?: string;
  }

  interface RequestOptions<TData = any, TResData = any> {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'CONNECT';
    data?: TData;
    header?: Record<string, string>;
    timeout?: number;
    dataType?: string;
    responseType?: string;
    enableHttp2?: boolean;
    success?: (result: { data: TResData; statusCode: number; header: Record<string, string> }) => void;
    fail?: (error: { errMsg: string }) => void;
    complete?: () => void;
  }

  interface RequestTask {
    abort(): void;
    offHeadersReceived(callback?: () => void): void;
    onHeadersReceived(callback: () => void): void;
  }

  interface LoginSuccess {
    code: string;
    errMsg: string;
  }
}

declare const wx: {
  openPrivacyContract?(options: { fail?: () => void }): void;
  getAccountInfoSync(): { miniProgram: { envVersion: 'develop' | 'trial' | 'release' } };
  request<TData = any, TResData = any>(options: WechatMiniprogram.RequestOptions<TData, TResData>): WechatMiniprogram.RequestTask;

  setStorageSync(key: string, data: any): void;
  getStorageSync(key: string): any;
  removeStorageSync(key: string): void;
  clearStorageSync(): void;
  getStorageInfoSync(): { keys: string[]; currentSize: number; limitSize: number };

  login(options: {
    timeout?: number;
    success?: (result: WechatMiniprogram.LoginSuccess) => void;
    fail?: (error: { errMsg: string }) => void;
  }): void;

  showToast(options: { title: string; icon?: 'success' | 'error' | 'loading' | 'none'; duration?: number; mask?: boolean }): void;
  hideToast(options?: Record<string, never>): void;
  showLoading(options: { title: string; mask?: boolean }): void;
  hideLoading(options?: Record<string, never>): void;
  showModal(options: {
    title?: string;
    content: string;
    showCancel?: boolean;
    confirmText?: string;
    cancelText?: string;
    success?: (result: { confirm: boolean; cancel: boolean }) => void;
    fail?: (error: { errMsg: string }) => void;
  }): void;

  scanCode(options: {
    onlyFromCamera?: boolean;
    scanType?: Array<'barCode' | 'qrCode' | 'datamatrix' | 'pdf417'>;
    success?: (result: { result: string; scanType: string; charset: string; path?: string; rawData?: string }) => void;
    fail?: (error: { errMsg: string }) => void;
  }): void;

  navigateTo(options: { url: string; success?: () => void; fail?: (error: { errMsg: string }) => void }): void;
  redirectTo(options: { url: string; success?: () => void; fail?: (error: { errMsg: string }) => void }): void;
  switchTab(options: { url: string; success?: () => void; fail?: (error: { errMsg: string }) => void }): void;
  reLaunch(options: { url: string; success?: () => void; fail?: (error: { errMsg: string }) => void }): void;
  navigateBack(options?: { delta?: number }): void;

  startPullDownRefresh(options?: Record<string, never>): void;
  stopPullDownRefresh(options?: Record<string, never>): void;
  setNavigationBarTitle(options: { title: string }): void;
  canIUse(schema: string): boolean;
};
