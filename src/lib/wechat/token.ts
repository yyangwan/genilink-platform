import crypto from 'node:crypto';

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const QRCODE_URL = 'https://api.weixin.qq.com/cgi-bin/qrcode/create';

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const res = await fetch(
    `${TOKEN_URL}?grant_type=client_credential&appid=${process.env.WECHAT_MP_APPID}&secret=${process.env.WECHAT_MP_SECRET}`
  );
  const data = await res.json();

  if (data.errcode) {
    throw new Error(`WeChat token error: ${data.errmsg}`);
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000, // 5 min buffer
  };

  return data.access_token;
}

export async function createQRCode(scene: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${QRCODE_URL}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expire_seconds: 300,
      action_name: 'QR_STR_SCENE',
      action_info: { scene: { scene_str: scene } },
    }),
  });
  const data = await res.json();

  if (data.errcode) {
    throw new Error(`WeChat QR error: ${data.errmsg}`);
  }

  // Return the WeChat scan URL that shows the QR code
  return `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(data.ticket)}`;
}

export function verifySignature(signature: string, timestamp: string, nonce: string): boolean {
  const token = process.env.WECHAT_MP_TOKEN;
  const arr = [token, timestamp, nonce].sort();
  const sha1 = crypto.createHash('sha1').update(arr.join('')).digest('hex');
  return sha1 === signature;
}

export function parseXML(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const key = match[1] || match[3];
    const value = match[2] || match[4];
    if (key && value) result[key] = value;
  }
  return result;
}
