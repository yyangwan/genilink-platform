import 'server-only';

import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { normalizeProductWebsiteUrl } from '@/lib/product-website/url';
import { consumeFixedWindowRateLimit } from '@/lib/marketing/rate-limit';
import { QUICK_CHECK_RULE_VERSION, quickCheckResult } from './quick-check-contract';
import { miniIpHash, QuickCheckError, readIdempotencyKey, visitorHash } from './quick-check-http';
import type { AcquisitionSession, Prisma, WebsiteQuickCheck } from '@/generated/prisma/client';

const VISITOR_TTL = 14 * 86400_000;
const REPORT_TTL = 7 * 86400_000;
const LEASE_TTL = 20_000;
const MAX_ATTEMPTS = 3;
const CHANNELS = new Set(['official_account', 'community', 'share', 'direct']);

async function rateLimit(key: string, max: number) {
  const { allowed, retryAfterSeconds } = await consumeFixedWindowRateLimit(`mini:${key}`, max, 3600);
  if (!allowed) throw new QuickCheckError(429, 'RATE_LIMITED', '提交过于频繁，请稍后重试', retryAfterSeconds);
}

export function findVisitor(request: Request) {
  const token = request.headers.get('x-visitor-token') ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return prisma.acquisitionSession.findFirst({
    where: { anonymousHash: visitorHash(token), firstSource: 'wechat_mini_program', expiresAt: { gt: new Date() } },
  });
}

export async function createVisitor(request: Request, rawChannel: unknown) {
  const existing = await findVisitor(request);
  if (existing) {
    return { visitorToken: request.headers.get('x-visitor-token'), expiresAt: existing.expiresAt };
  }
  await rateLimit(`visitor-ip:${miniIpHash(request)}`, 60);
  const token = randomBytes(32).toString('base64url');
  const channel = typeof rawChannel === 'string' && CHANNELS.has(rawChannel) ? rawChannel : 'direct';
  const source = 'wechat_mini_program';
  const visitor = await prisma.acquisitionSession.create({
    data: {
      anonymousHash: visitorHash(token),
      firstSource: source,
      firstMedium: channel,
      lastSource: source,
      lastMedium: channel,
      firstTouch: { source, channel },
      lastTouch: { source, channel },
      landingPath: '/pages/home/home',
      expiresAt: new Date(Date.now() + VISITOR_TTL),
    },
  });
  return { visitorToken: token, expiresAt: visitor.expiresAt };
}

function normalizeTarget(input: unknown) {
  const invalid = new QuickCheckError(400, 'INVALID_URL', '请输入公开的官网网址');
  if (typeof input !== 'string' || input.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(input)) throw invalid;
  const normalized = normalizeProductWebsiteUrl(input);
  if (!normalized.ok) throw invalid;
  const url = new URL(normalized.url);
  if (url.port) throw invalid;
  url.hostname = url.hostname.replace(/\.$/, '');
  return { targetUrl: `${url.origin}/`, hostname: normalized.hostname.toLowerCase().replace(/\.$/, '') };
}

export function reportOutput(report: WebsiteQuickCheck) {
  return {
    id: report.id,
    targetUrl: report.targetUrl,
    status: report.status,
    ...(report.result ? { result: report.result } : {}),
    ...(report.errorCode ? { errorCode: report.errorCode } : {}),
    retryable: report.attempts < MAX_ATTEMPTS && (
      report.status === 'failed' ||
      (report.status === 'running' && (!report.leaseUntil || report.leaseUntil.getTime() <= Date.now()))
    ),
    saved: Boolean(report.ownerUserId),
    createdAt: report.createdAt,
  };
}

async function fetchQuickCheck(report: WebsiteQuickCheck) {
  const url = process.env.WEBSITE_QUICK_CHECK_SERVICE_URL;
  const secret = process.env.WEBSITE_QUICK_CHECK_SERVICE_SECRET;
  if (!url || !secret) return null;
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/api/internal/website-quick-check/v1`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: report.id, url: report.targetUrl }),
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) return null;
    const result = quickCheckResult.safeParse(await response.json());
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function runQuickCheck(request: Request, visitor: AcquisitionSession, input: unknown) {
  const { targetUrl, hostname } = normalizeTarget(input);
  const idempotencyKey = readIdempotencyKey(request);
  const where = { acquisitionSessionId_idempotencyKey: { acquisitionSessionId: visitor.id, idempotencyKey } };
  const existing = await prisma.websiteQuickCheck.findUnique({ where });
  if (existing) {
    if (existing.targetUrl !== targetUrl) throw new QuickCheckError(409, 'IDEMPOTENCY_CONFLICT', '该操作标识已用于其他网址');
    if (existing.ownerUserId || (existing.expiresAt && existing.expiresAt <= new Date())) throw missingReport();
    if (!reportOutput(existing).retryable) return { report: existing, created: false };
  }
  await rateLimit(`check-visitor:${visitor.id}`, 12);
  await rateLimit(`check-ip:${miniIpHash(request)}`, 45);
  await rateLimit(`check-domain:${hostname}`, 45);
  const lease = await prisma.$transaction(async (tx) => {
    // Keep the capacity decision consistent across app instances and deployment slots.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81023901)`;
    const now = new Date();
    const current = await tx.websiteQuickCheck.findUnique({ where });
    if (current) {
      if (current.targetUrl !== targetUrl) throw new QuickCheckError(409, 'IDEMPOTENCY_CONFLICT', '该操作标识已用于其他网址');
      if (current.ownerUserId || (current.expiresAt && current.expiresAt <= now)) throw missingReport();
      if (!reportOutput(current).retryable) return { report: current, acquired: false, created: false };
    }
    const running = await tx.websiteQuickCheck.count({ where: { status: 'running', leaseUntil: { gt: now } } });
    if (running >= 6) throw new QuickCheckError(429, 'QUICK_CHECK_BUSY', '检测任务较多，请稍后重试', 3);
    const claim = { status: 'running', leaseId: randomUUID(), leaseUntil: new Date(now.getTime() + LEASE_TTL), errorCode: null };
    const report = current
      ? await tx.websiteQuickCheck.update({ where: { id: current.id }, data: { ...claim, attempts: { increment: 1 } } })
      : await tx.websiteQuickCheck.create({
        data: {
          ...claim, targetUrl, idempotencyKey, acquisitionSessionId: visitor.id,
          ruleVersion: QUICK_CHECK_RULE_VERSION, attempts: 1, expiresAt: new Date(now.getTime() + REPORT_TTL),
        },
      });
    return { report, acquired: true, created: !current };
  });
  if (!lease.acquired) return { report: lease.report, created: false };

  const result = await fetchQuickCheck(lease.report);
  const report = await prisma.$transaction(async (tx) => {
    const updated = await tx.websiteQuickCheck.updateMany({
      where: { id: lease.report.id, status: 'running', leaseId: lease.report.leaseId },
      data: {
        status: result ? 'completed' : 'failed',
        errorCode: result ? null : 'QUICK_CHECK_UPSTREAM_UNAVAILABLE',
        ...(result ? { result } : {}),
        leaseId: null,
        leaseUntil: null,
      },
    });
    if (updated.count === 1 && result) await reportEvent(tx, lease.report, visitor, 'mini_quick_check_completed');
    return tx.websiteQuickCheck.findUnique({ where: { id: lease.report.id } });
  });
  if (!report) throw missingReport();
  return { report, created: lease.created };
}

export function missingReport() {
  return new QuickCheckError(404, 'REPORT_NOT_FOUND', '未找到这份官网快检');
}

export async function reportAccess(id: string, visitorId?: string, userId?: string) {
  const report = await prisma.websiteQuickCheck.findUnique({ where: { id }, include: { acquisitionSession: true } });
  if (!report) throw missingReport();
  if (report.ownerUserId) {
    if (report.ownerUserId !== userId) throw missingReport();
  } else if (report.acquisitionSessionId !== visitorId || !report.expiresAt || report.expiresAt <= new Date()) {
    throw missingReport();
  }
  return report;
}

export async function reportEvent(
  tx: Prisma.TransactionClient,
  report: WebsiteQuickCheck,
  visitor: AcquisitionSession,
  name: string,
  userId?: string,
) {
  await tx.funnelEvent.upsert({
    where: { eventId: `quick-check:${report.id}:${name}` },
    create: {
      eventId: `quick-check:${report.id}:${name}`,
      eventName: name, eventSource: 'server', sessionId: visitor.id,
      userId, source: visitor.firstSource, medium: visitor.firstMedium,
      properties: { quickCheckId: report.id }, occurredAt: new Date(),
    },
    update: {},
  });
}

export async function claimQuickCheck(id: string, visitorId: string | undefined, userId: string) {
  return prisma.$transaction(async (tx) => {
    const updated = visitorId ? await tx.websiteQuickCheck.updateMany({
      where: { id, acquisitionSessionId: visitorId, ownerUserId: null, status: 'completed', expiresAt: { gt: new Date() } },
      data: { ownerUserId: userId, expiresAt: null },
    }) : { count: 0 };
    const report = await tx.websiteQuickCheck.findFirst({ where: { id, ownerUserId: userId }, include: { acquisitionSession: true } });
    if (!report) throw missingReport();
    if (updated.count === 1) await reportEvent(tx, report, report.acquisitionSession, 'mini_quick_check_saved', userId);
    return report;
  });
}
