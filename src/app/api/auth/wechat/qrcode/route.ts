import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAccessToken } from '@/lib/wechat/token';
import crypto from 'crypto';

export async function GET() {
  try {
    const APP_ID = process.env.WECHAT_MP_APPID;
    const APP_SECRET = process.env.WECHAT_MP_SECRET;

    if (!APP_ID || !APP_SECRET) {
      return NextResponse.json(
        { error: 'WeChat MP not configured' },
        { status: 503 }
      );
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
