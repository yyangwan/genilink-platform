import { createHmac } from 'node:crypto';
import { prisma } from '@/lib/db';

function visitorHash(token: string): string {
  const secret = process.env.MARKETING_HMAC_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('MARKETING_HMAC_SECRET or AUTH_SECRET is required');
  return createHmac('sha256', secret).update(`visitor:${token}`).digest('hex');
}

export async function resolveCheckoutAttribution(visitorToken: string | undefined, userId: string) {
  if (!visitorToken || !/^[A-Za-z0-9_-]{32,128}$/.test(visitorToken)) return null;
  const session = await prisma.acquisitionSession.findFirst({
    where: { anonymousHash: visitorHash(visitorToken), expiresAt: { gt: new Date() } },
  });
  if (!session) return null;
  if (!session.userId) {
    await prisma.acquisitionSession.update({ where: { id: session.id }, data: { userId } });
  } else if (session.userId !== userId) {
    return null;
  }
  return {
    acquisitionSessionId: session.id,
    attributionSnapshot: {
      firstTouch: session.firstTouch,
      lastTouch: session.lastTouch,
      firstSource: session.firstSource,
      firstMedium: session.firstMedium,
      firstCampaign: session.firstCampaign,
      lastSource: session.lastSource,
      lastMedium: session.lastMedium,
      lastCampaign: session.lastCampaign,
    },
  };
}
