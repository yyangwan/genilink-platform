import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAccessToken } from '@/lib/wechat/token';
import crypto from 'crypto';

function isDevelopmentWechatFallbackEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function buildDevelopmentQrDataUrl(scene: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <rect width="400" height="400" rx="24" fill="#ffffff" />
      <rect x="24" y="24" width="352" height="352" rx="20" fill="#f4f6fa" stroke="#d6dbe6" />
      <rect x="56" y="56" width="88" height="88" rx="12" fill="#0b0d14" />
      <rect x="256" y="56" width="88" height="88" rx="12" fill="#0b0d14" />
      <rect x="56" y="256" width="88" height="88" rx="12" fill="#0b0d14" />
      <text x="200" y="206" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#0b0d14">微信开发模式</text>
      <text x="200" y="238" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#5b6477">scene: ${scene}</text>
      <text x="200" y="280" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#5b6477">本地登录已启用</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function createDevelopmentLoginSession(scene: string, token: string) {
  const devOpenid = 'wechat-dev-openid';
  let user = await prisma.user.findUnique({ where: { wechatOpenid: devOpenid } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        wechatOpenid: devOpenid,
        name: 'WeChat Dev',
        onboardingCompleted: false,
        onboardingStep: 'welcome',
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        name: "WeChat Dev's workspace",
      },
    });

    await prisma.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: 'owner',
      },
    });
  }

  await prisma.wechatLoginSession.create({
    data: {
      scene,
      token,
      status: 'confirmed',
      openid: devOpenid,
      userId: user.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
}

export async function GET() {
  try {
    const APP_ID = process.env.WECHAT_MP_APPID;
    const APP_SECRET = process.env.WECHAT_MP_SECRET;

    if (!APP_ID || !APP_SECRET) {
      if (!isDevelopmentWechatFallbackEnabled()) {
        return NextResponse.json(
          { error: 'WeChat MP not configured' },
          { status: 503 }
        );
      }

      const scene = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      const token = crypto.randomBytes(32).toString('hex');
      await createDevelopmentLoginSession(scene, token);

      return NextResponse.json({
        url: buildDevelopmentQrDataUrl(scene),
        scene,
        expiresAt: Date.now() + 5 * 60 * 1000,
        devMode: true,
      });
    }

    // Generate unique scene string and one-time token
    const scene = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    const token = crypto.randomBytes(32).toString('hex');

    // Create login session in DB
    await prisma.wechatLoginSession.create({
      data: {
        scene,
        token,
        status: 'pending',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
      },
    });

    // Create temporary QR code via WeChat MP API
    const accessToken = await getAccessToken();
    const qrRes = await fetch(
      `https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expire_seconds: 300,
          action_name: 'QR_STR_SCENE',
          action_info: { scene: { scene_str: scene } },
        }),
      }
    );

    const qrData = await qrRes.json();
    if (qrData.errcode) {
      throw new Error(`WeChat QR error: ${qrData.errcode} ${qrData.errmsg}`);
    }

    const qrcodeUrl = `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(qrData.ticket)}`;

    return NextResponse.json({
      url: qrcodeUrl,
      scene,
      expiresAt: Date.now() + qrData.expire_seconds * 1000,
    });
  } catch (error) {
    console.error('WeChat QR generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}
