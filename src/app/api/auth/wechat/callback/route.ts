import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  verifySignature,
  parseXML,
} from '@/lib/wechat/token';

const MP_TOKEN = process.env.WECHAT_MP_TOKEN || 'genilink_mp_verify';

// GET — WeChat URL verification (server config)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const signature = searchParams.get('signature') || '';
  const timestamp = searchParams.get('timestamp') || '';
  const nonce = searchParams.get('nonce') || '';
  const echostr = searchParams.get('echostr') || '';

  if (verifySignature(signature, timestamp, nonce)) {
    return new NextResponse(echostr, {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
}

// POST — WeChat event callback (SCAN, subscribe via QR)
export async function POST(req: NextRequest) {
  const body = await req.text();
  const data = parseXML(body);

  const msgType = data.MsgType;
  const event = data.Event;
  const openid = data.FromUserName;

  if (!openid) {
    return new NextResponse('success', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  try {
    // User scans a parameterized QR code (already following)
    if (msgType === 'event' && event === 'SCAN') {
      const scene = data.EventKey;
      if (scene) {
        await handleScan(openid, scene);
      }
    }

    // User follows via QR code (EventKey starts with "qrscene_")
    if (
      msgType === 'event' &&
      event === 'subscribe' &&
      data.EventKey?.startsWith('qrscene_')
    ) {
      const scene = data.EventKey.replace('qrscene_', '');
      if (scene) {
        await handleScan(openid, scene);
      }
    }
  } catch (error) {
    console.error('WeChat callback error:', error);
  }

  // WeChat expects "success" as the response body
  return new NextResponse('success', {
    headers: { 'Content-Type': 'text/plain' },
  });
}

async function handleScan(openid: string, scene: string) {
  // Find the pending login session
  const loginSession = await prisma.wechatLoginSession.findUnique({
    where: { scene },
  });

  if (!loginSession || loginSession.status === 'confirmed') return;
  if (new Date() > loginSession.expiresAt) return;

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { wechatOpenid: openid },
  });

  if (!user) {
    // Create new WeChat user (no email, name defaults to openid prefix)
    user = await prisma.user.create({
      data: {
        wechatOpenid: openid,
        name: `WeChat_${openid.slice(-6)}`,
        onboardingCompleted: false,
        onboardingStep: 'welcome',
      },
    });

    // Create a default workspace for the new user
    const workspace = await prisma.workspace.create({
      data: { name: `${user.name}'s workspace` },
    });
    await prisma.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: 'owner',
      },
    });
  }

  // Mark session as confirmed
  await prisma.wechatLoginSession.update({
    where: { scene },
    data: {
      status: 'confirmed',
      openid,
      userId: user.id,
    },
  });
}
