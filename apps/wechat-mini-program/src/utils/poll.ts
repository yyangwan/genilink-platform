/**
 * 轮询与退避工具：用于「检测进行中」的等待/重试。
 *
 * - 指数退避 + 抖动，避免密集打点。
 * - 通过 StaleGuard 代次号丢弃过期响应：页面卸载或用户手动刷新后，
 *   旧轮询的回调一律忽略。
 */

import { StaleGuard } from './request';

export interface PollOptions<T> {
  /** 执行一次取数；resolve 即代表仍未完成需继续轮询。 */
  fetch: () => Promise<T>;
  /** 判断结果是否已完成（停止轮询）。 */
  isDone: (result: T) => boolean;
  /** 轮询间隔基数（毫秒），默认 2000。 */
  intervalMs?: number;
  /** 最多轮询次数，默认 45（约 3 分钟）。 */
  maxAttempts?: number;
  /** 每次有效结果的回调（含代次校验由调用方处理）。 */
  onUpdate?: (result: T) => void;
  /** 终止（完成或超次数）时的回调。 */
  onFinish?: (result: T | undefined, exhausted: boolean) => void;
  onError?: (err: unknown) => void;
}

export interface PollHandle {
  stop(): void;
}

export function startPolling<T>(guard: StaleGuard, options: PollOptions<T>): PollHandle {
  const interval = options.intervalMs || 2000;
  const maxAttempts = options.maxAttempts || 45;
  let attempt = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = (): void => {
    if (stopped) return;
    const token = guard.next();
    attempt += 1;
    options
      .fetch()
      .then((result) => {
        if (stopped || !guard.isCurrent(token)) return;
        if (options.isDone(result)) {
          stopped = true;
          if (options.onUpdate) options.onUpdate(result);
          if (options.onFinish) options.onFinish(result, false);
          return;
        }
        if (options.onUpdate) options.onUpdate(result);
        if (attempt >= maxAttempts) {
          stopped = true;
          if (options.onFinish) options.onFinish(result, true);
          return;
        }
        // 指数退避：2s、4s、8s，封顶 10s，加抖动防同步。
        const delay = Math.min(interval * Math.pow(2, Math.floor(attempt / 6)), 10000);
        const jitter = delay + Math.floor(Math.random() * 500);
        timer = setTimeout(run, jitter);
      })
      .catch((err) => {
        if (stopped || !guard.isCurrent(token)) return;
        if (attempt >= maxAttempts) {
          stopped = true;
          if (options.onError) options.onError(err);
          if (options.onFinish) options.onFinish(undefined, true);
          return;
        }
        timer = setTimeout(run, interval * 2);
      });
  };

  run();

  return {
    stop(): void {
      stopped = true;
      if (timer) clearTimeout(timer);
      guard.invalidate();
    }
  };
}

/** 简易 sleep（Promise 版）。 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
