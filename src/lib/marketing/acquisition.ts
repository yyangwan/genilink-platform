import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { assertPublicHttpUrl } from '@/lib/marketing/public-url';
import { consumeFixedWindowRateLimit } from '@/lib/marketing/rate-limit';

const VISITOR_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const INTENT_DEDUPE_MS = 10 * 60 * 1000;
const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'source'] as const;

type Attribution = Partial<Record<(typeof ATTRIBUTION_KEYS)[number], string>> & {
  landingPath?: string;
  referrerHost?: string;
};

function secret(): string {
  const value = process.env.MARKETING_HMAC_SECRET || process.env.AUTH_SECRET;
  if (!value) throw new Error('MARKETING_HMAC_SECRET or AUTH_SECRET is required');
  return value;
}

function digest(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('hex');
}

function trimField(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function sanitizeAttribution(value: unknown): Attribution {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) result[key] = trimField(input[key], 120);
  result.landingPath = trimField(input.landingPath, 500) || '/';
  result.referrerHost = trimField(input.referrerHost, 255);
  return result;
}

export class AcquisitionRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('ACQUISITION_RATE_LIMITED');
  }
}

export async function createAcquisitionIntent(params: {
  body: unknown;
  visitorToken?: string;
  clientIp: string;
}) {
  const body = params.body && typeof params.body === 'object' ? params.body as Record<string, unknown> : {};
  if (body.kind !== 'website_diagnosis') throw new TypeError('Unsupported acquisition intent');

  const target = await assertPublicHttpUrl(body.targetUrl);
  const attribution = sanitizeAttribution(body.attribution);
  const visitorToken = params.visitorToken && /^[A-Za-z0-9_-]{32,128}$/.test(params.visitorToken)
    ? params.visitorToken
    : randomBytes(32).toString('base64url');
  const anonymousHash = digest(`visitor:${visitorToken}`);
  const ipHash = digest(`acquisition-ip:${params.clientIp || 'unknown'}`);
  const rateLimit = await consumeFixedWindowRateLimit(`acquisition:${ipHash}`, 30, 60 * 60);
  if (!rateLimit.allowed) throw new AcquisitionRateLimitError(rateLimit.retryAfterSeconds);

  const now = new Date();
  const source = attribution.utm_source || attribution.source;
  const medium = attribution.utm_medium;
  const campaign = attribution.utm_campaign;
  const idempotencyKey = digest([
    'website-diagnosis',
    anonymousHash,
    target.url,
    Math.floor(now.getTime() / INTENT_DEDUPE_MS),
  ].join(':'));

  const result = await prisma.$transaction(async (tx) => {
    const visitor = await tx.acquisitionSession.upsert({
      where: { anonymousHash },
      create: {
        anonymousHash,
        firstSource: source,
        firstMedium: medium,
        firstCampaign: campaign,
        lastSource: source,
        lastMedium: medium,
        lastCampaign: campaign,
        firstTouch: attribution,
        lastTouch: attribution,
        landingPath: attribution.landingPath || '/',
        referrerHost: attribution.referrerHost,
        expiresAt: new Date(now.getTime() + VISITOR_TTL_MS),
      },
      update: {
        lastSource: source,
        lastMedium: medium,
        lastCampaign: campaign,
        lastTouch: attribution,
        expiresAt: new Date(now.getTime() + VISITOR_TTL_MS),
      },
    });

    const intent = await tx.acquisitionIntent.upsert({
      where: { idempotencyKey },
      create: {
        sessionId: visitor.id,
        kind: 'website_diagnosis',
        targetUrl: target.url,
        planKey: trimField(body.planKey, 80),
        idempotencyKey,
        expiresAt: new Date(now.getTime() + INTENT_TTL_MS),
      },
      update: {},
    });

    await tx.funnelEvent.upsert({
      where: { eventId: `intent:${intent.id}:created` },
      create: {
        eventId: `intent:${intent.id}:created`,
        sessionId: visitor.id,
        eventName: 'diagnosis_intent_created',
        eventSource: 'server',
        source,
        medium,
        campaign,
        properties: { intentId: intent.id },
        occurredAt: now,
      },
      update: {},
    });

    return { visitor, intent };
  });

  return {
    visitorToken,
    intentId: result.intent.id,
    expiresAt: result.intent.expiresAt,
    nextUrl: '/auth/login?callbackUrl=%2Fstart',
  };
}
