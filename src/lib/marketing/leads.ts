import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { contactHash, encryptContact, normalizeContact } from '@/lib/marketing/contact-crypto';
import { consumeFixedWindowRateLimit } from '@/lib/marketing/rate-limit';
import { normalizeProductWebsiteUrl } from '@/lib/product-website/url';

export type LeadInput = {
  kind: 'agency' | 'private_deployment' | 'managed_service';
  companyName: string;
  website?: string;
  industry?: string;
  phone?: string;
  email?: string;
  wechat?: string;
  projectCountBand?: string;
  budgetBand?: string;
  timeline?: string;
  deploymentPreference?: string;
  requirements?: string;
  contactConsent: true;
  privacyVersion: string;
  submissionToken: string;
};

export class LeadRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) { super('LEAD_RATE_LIMITED'); }
}

export class LeadWithdrawalNotFoundError extends Error {
  constructor() { super('LEAD_WITHDRAWAL_NOT_FOUND'); }
}

function marketingSecret() {
  const secret = process.env.MARKETING_HMAC_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('MARKETING_HMAC_SECRET or AUTH_SECRET is required');
  return secret;
}

function withdrawalToken(submissionToken: string) {
  return createHmac('sha256', marketingSecret()).update(`lead-withdrawal:${submissionToken}`).digest('base64url');
}

function withdrawalTokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function scoreLead(input: LeadInput) {
  let score = 0;
  if (input.kind === 'private_deployment') score += 30;
  if (['10-49', '50+'].includes(input.projectCountBand || '')) score += 20;
  if (['within_1_month', 'within_3_months'].includes(input.timeline || '')) score += 15;
  if (['enterprise', 'custom'].includes(input.budgetBand || '')) score += 15;
  if (input.website) score += 10;
  if (input.email && !/@(qq|163|126|gmail|outlook|hotmail)\./i.test(input.email)) score += 10;
  return { score, grade: score >= 60 ? 'hot' : score >= 35 ? 'warm' : 'cold' };
}

async function visitorId(token?: string) {
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  const hash = createHmac('sha256', marketingSecret()).update(`visitor:${token}`).digest('hex');
  const visitor = await prisma.acquisitionSession.findFirst({
    where: { anonymousHash: hash, expiresAt: { gt: new Date() } },
    select: { id: true, firstSource: true, firstMedium: true, firstCampaign: true },
  });
  return visitor;
}

export async function createMarketingLead(input: LeadInput, context: { visitorToken?: string; clientIp: string }) {
  const contact = normalizeContact({ phone: input.phone, email: input.email, wechat: input.wechat });
  if (!contact.phone && !contact.email && !contact.wechat) throw new TypeError('至少提供一种联系方式');
  const ipHash = createHmac('sha256', marketingSecret()).update(`lead-ip:${context.clientIp || 'unknown'}`).digest('hex');
  const limit = await consumeFixedWindowRateLimit(`lead:${ipHash}`, 5, 60 * 60);
  if (!limit.allowed) throw new LeadRateLimitError(limit.retryAfterSeconds);

  const website = input.website ? normalizeProductWebsiteUrl(input.website) : null;
  if (website && !website.ok) throw new TypeError(website.error);
  const attribution = await visitorId(context.visitorToken);
  const scored = scoreLead(input);
  const destination = process.env.SALES_LEAD_WEBHOOK_URL ? 'sales-webhook' : null;
  const contactWithdrawalToken = withdrawalToken(input.submissionToken);

  const lead = await prisma.$transaction(async (tx) => {
    const existing = await tx.marketingLead.findUnique({ where: { submissionToken: input.submissionToken } });
    if (existing) return existing;
    const lead = await tx.marketingLead.create({
      data: {
        sessionId: attribution?.id ?? null,
        kind: input.kind,
        companyName: input.companyName.trim(),
        website: website?.ok ? website.url : null,
        industry: input.industry || null,
        contactCiphertext: encryptContact(contact),
        contactHash: contactHash(contact),
        withdrawalTokenHash: withdrawalTokenHash(contactWithdrawalToken),
        projectCountBand: input.projectCountBand || null,
        budgetBand: input.budgetBand || null,
        timeline: input.timeline || null,
        deploymentPreference: input.deploymentPreference || null,
        requirements: input.requirements || null,
        score: scored.score,
        grade: scored.grade,
        contactConsentAt: new Date(),
        privacyVersion: input.privacyVersion,
        submissionToken: input.submissionToken,
        statusEvents: { create: { toStatus: 'new' } },
        ...(destination && scored.grade === 'hot' ? { deliveries: { create: { destination } } } : {}),
      },
    });
    await tx.funnelEvent.upsert({
      where: { eventId: `lead:${lead.id}:submitted` },
      create: {
        eventId: `lead:${lead.id}:submitted`, sessionId: attribution?.id ?? null,
        eventName: 'lead_submitted', eventSource: 'server',
        source: attribution?.firstSource, medium: attribution?.firstMedium, campaign: attribution?.firstCampaign,
        properties: { leadId: lead.id, kind: lead.kind, grade: lead.grade }, occurredAt: new Date(),
      }, update: {},
    });
    return lead;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { lead, withdrawalToken: contactWithdrawalToken };
}

export async function withdrawMarketingLeadContact(input: {
  leadId: string;
  token: string;
  reason?: string;
  clientIp: string;
}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) throw new LeadWithdrawalNotFoundError();
  const ipHash = createHmac('sha256', marketingSecret()).update(`lead-withdraw-ip:${input.clientIp || 'unknown'}`).digest('hex');
  const limit = await consumeFixedWindowRateLimit(`lead:${ipHash}:withdraw`, 10, 60 * 60);
  if (!limit.allowed) throw new LeadRateLimitError(limit.retryAfterSeconds);

  const lead = await prisma.marketingLead.findUnique({
    where: { id: input.leadId },
    select: { id: true, withdrawalTokenHash: true, contactWithdrawnAt: true },
  });
  const suppliedHash = withdrawalTokenHash(input.token);
  if (!lead || !timingSafeEqual(Buffer.from(lead.withdrawalTokenHash, 'hex'), Buffer.from(suppliedHash, 'hex'))) {
    throw new LeadWithdrawalNotFoundError();
  }
  if (lead.contactWithdrawnAt) return { withdrawnAt: lead.contactWithdrawnAt, alreadyWithdrawn: true };

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.marketingLead.updateMany({
      where: { id: lead.id, contactWithdrawnAt: null },
      data: { contactCiphertext: null, contactHash: null, contactWithdrawnAt: now, version: { increment: 1 } },
    });
    if (updated.count !== 1) return null;
    await tx.marketingLeadPrivacyEvent.create({
      data: { leadId: lead.id, action: 'contact_consent_withdrawn', reason: input.reason?.trim() || null },
    });
    await tx.leadNotificationDelivery.updateMany({
      where: { leadId: lead.id, status: { in: ['pending', 'retry'] } },
      data: { status: 'canceled', lockedBy: null, lockedUntil: null, lastError: 'CONTACT_WITHDRAWN' },
    });
    return { withdrawnAt: now, alreadyWithdrawn: false };
  });
  if (result) return result;
  const current = await prisma.marketingLead.findUnique({ where: { id: lead.id }, select: { contactWithdrawnAt: true } });
  if (current?.contactWithdrawnAt) return { withdrawnAt: current.contactWithdrawnAt, alreadyWithdrawn: true };
  throw new LeadWithdrawalNotFoundError();
}
