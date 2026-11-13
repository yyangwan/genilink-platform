/** 展示层格式化工具：时间、链接、手机号脱敏。 */

/** 把 ISO 时间或时间戳格式化为「MM-DD HH:mm」。 */
export function formatTime(input: string | number | undefined): string {
  if (input === undefined || input === null || input === '') return '—';
  const date = typeof input === 'number' ? new Date(input) : new Date(input);
  if (isNaN(date.getTime())) return '—';
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  );
}

/** 展示用链接：去掉协议前缀并截断，避免长 URL 撑破卡片。 */
export function shortenUrl(url: string | undefined, max = 42): string {
  if (!url) return '';
  const trimmed = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + '…';
}

/** 用户输入容错：补协议、去首尾空白；空输入返回空串。 */
export function normalizeUrlInput(raw: string): string {
  const input = (raw || '').trim();
  if (!input) return '';
  const withScheme = /^https?:\/\//i.test(input) ? input : 'https://' + input;
  const match = /^(https?:\/\/[^/?#]+)(?:[/?#]|$)/i.exec(withScheme);
  return match ? match[1] + '/' : '';
}

/** 校验链接是否「看起来可检测」：有主机名即可，最终以服务端结论为准。 */
export function looksLikeUrl(url: string): boolean {
  try {
    const parsed = /^https?:\/\/([^/?#]+)/i.exec(url);
    if (!parsed) return false;
    const host = parsed[1];
    return host.indexOf('.') > 0 && !/[@\s\\]/.test(host);
  } catch {
    return false;
  }
}

/** 手机号脱敏：保留前 3 后 4。 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/** 简易手机号格式校验（中国大陆 11 位）。 */
export function isValidPhone(phone: string): boolean {
  return /^1\d{10}$/.test(phone);
}

/** 智链短信验证码为 6 位数字。 */
export function isValidSmsCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}
