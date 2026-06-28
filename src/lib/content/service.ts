import { proxyRequest, proxyStreamRequest } from '@/lib/proxy/zhijian-client';
import type { ContentAuthContext } from '@/lib/auth/content-auth';

const SERVICE = 'content' as const;

export const CRUD_TIMEOUT = 30_000;
export const STREAM_TIMEOUT = 180_000;
const DEFAULT_GENERATION_PLATFORM = 'wechat';

type Ctx = Pick<ContentAuthContext, 'projectId' | 'serviceToken'> & { accessToken?: string };

function ctxOpts(ctx: Ctx) {
  return { projectId: ctx.projectId, accessToken: ctx.serviceToken, service: SERVICE };
}

// ─── Content CRUD ──────────────────────────────────────────────────

export function listContents(ctx: Ctx) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/content', timeoutMs: CRUD_TIMEOUT });
}

export function createContent(ctx: Ctx, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/content', method: 'POST', body, timeoutMs: CRUD_TIMEOUT });
}

export function getContent(ctx: Ctx, contentId: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}`, timeoutMs: CRUD_TIMEOUT });
}

export function updateContent(ctx: Ctx, contentId: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}`, method: 'PUT', body, timeoutMs: CRUD_TIMEOUT });
}

export function deleteContent(ctx: Ctx, contentId: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}`, method: 'DELETE', timeoutMs: CRUD_TIMEOUT });
}

function getRequestedPlatforms(body: Record<string, unknown>) {
  const requested = typeof body.platform === 'string'
    ? [body.platform]
    : Array.isArray(body.platforms)
      ? body.platforms.filter((platform): platform is string => typeof platform === 'string')
      : [];

  const platforms = requested
    .map((platform) => platform.trim())
    .filter(Boolean);

  return [...new Set(platforms)].length > 0 ? [...new Set(platforms)] : [DEFAULT_GENERATION_PLATFORM];
}

function generateSinglePlatform(ctx: Ctx, contentId: string, body: Record<string, unknown>, platform: string) {
  return proxyStreamRequest({
    ...ctxOpts(ctx),
    path: '/api/generate',
    method: 'POST',
    body: { ...body, contentPieceId: contentId, platform },
    timeoutMs: STREAM_TIMEOUT,
  });
}

export async function generateContent(ctx: Ctx, contentId: string, body: Record<string, unknown>) {
  const platforms = getRequestedPlatforms(body);

  if (platforms.length === 1) {
    return generateSinglePlatform(ctx, contentId, body, platforms[0]);
  }

  const generatedPlatforms: string[] = [];
  for (const platform of platforms) {
    const response = await generateSinglePlatform(ctx, contentId, body, platform);
    if (!response.ok) return response;

    await response.text();
    generatedPlatforms.push(platform);
  }

  return Response.json({ ok: true, platforms: generatedPlatforms });
}

export function publishContent(ctx: Ctx, contentId: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/publish/${contentId}`, method: 'POST', body, timeoutMs: CRUD_TIMEOUT });
}

// ─── Content — status, schedule, analyze, optimize, quality, review ──

export function updateContentStatus(ctx: Ctx, contentId: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/status`, method: 'PATCH', body, timeoutMs: CRUD_TIMEOUT });
}

export function getContentSchedule(ctx: Ctx, contentId: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/schedule`, timeoutMs: CRUD_TIMEOUT });
}

export function setContentSchedule(ctx: Ctx, contentId: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/schedule`, method: 'POST', body, timeoutMs: CRUD_TIMEOUT });
}

export function deleteContentSchedule(ctx: Ctx, contentId: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/schedule`, method: 'DELETE', timeoutMs: CRUD_TIMEOUT });
}

export function analyzeContent(ctx: Ctx, contentId: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/analyze`, timeoutMs: CRUD_TIMEOUT });
}

export function optimizeContent(ctx: Ctx, contentId: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/optimize`, method: 'POST', body, timeoutMs: STREAM_TIMEOUT });
}

export function optimizeContentSeo(ctx: Ctx, contentId: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/optimize-seo`, method: 'POST', body, timeoutMs: STREAM_TIMEOUT });
}

export function getContentQuality(ctx: Ctx, contentId: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/quality`, timeoutMs: CRUD_TIMEOUT });
}

export function evaluateContentQuality(ctx: Ctx, contentId: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/quality`, method: 'POST', body, timeoutMs: STREAM_TIMEOUT });
}

export function getContentQualityLocal(ctx: Ctx, contentId: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/quality/local`, timeoutMs: CRUD_TIMEOUT });
}

export function createReviewLink(ctx: Ctx, contentId: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/review-link`, method: 'POST', body, timeoutMs: CRUD_TIMEOUT });
}

export function getReviewLink(ctx: Ctx, contentId: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/content/${contentId}/review-link`, timeoutMs: CRUD_TIMEOUT });
}

// ─── Brand Voices ────────────────────────────────────────────────────

export function listBrandVoices(ctx: Ctx) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/brand-voices', timeoutMs: CRUD_TIMEOUT });
}

export function createBrandVoice(ctx: Ctx, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/brand-voices', method: 'POST', body, timeoutMs: CRUD_TIMEOUT });
}

export function getBrandVoice(ctx: Ctx, id: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/brand-voices/${id}`, timeoutMs: CRUD_TIMEOUT });
}

export function updateBrandVoice(ctx: Ctx, id: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/brand-voices/${id}`, method: 'PUT', body, timeoutMs: CRUD_TIMEOUT });
}

export function deleteBrandVoice(ctx: Ctx, id: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/brand-voices/${id}`, method: 'DELETE', timeoutMs: CRUD_TIMEOUT });
}

// ─── Briefs ──────────────────────────────────────────────────────────

export function listBriefs(ctx: Ctx) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/briefs', timeoutMs: CRUD_TIMEOUT });
}

export function createBrief(ctx: Ctx, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/briefs', method: 'POST', body, timeoutMs: CRUD_TIMEOUT });
}

// ─── Templates ───────────────────────────────────────────────────────

export function listTemplates(ctx: Ctx) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/templates', timeoutMs: CRUD_TIMEOUT });
}

export function createTemplate(ctx: Ctx, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/templates', method: 'POST', body, timeoutMs: CRUD_TIMEOUT });
}

export function getTemplate(ctx: Ctx, id: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/templates/${id}`, timeoutMs: CRUD_TIMEOUT });
}

export function updateTemplate(ctx: Ctx, id: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/templates/${id}`, method: 'PUT', body, timeoutMs: CRUD_TIMEOUT });
}

export function deleteTemplate(ctx: Ctx, id: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/templates/${id}`, method: 'DELETE', timeoutMs: CRUD_TIMEOUT });
}

// ─── Calendar ────────────────────────────────────────────────────────

export function getCalendarEvents(ctx: Ctx) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/calendar/events', timeoutMs: CRUD_TIMEOUT });
}

// ─── Genie AI ────────────────────────────────────────────────────────

export function generateGenieContent(ctx: Ctx, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/genie/generate', method: 'POST', body, timeoutMs: STREAM_TIMEOUT });
}

export function getGenieGenerations(ctx: Ctx) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/genie/generate', timeoutMs: CRUD_TIMEOUT });
}

export function listGenieSources(ctx: Ctx) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/genie/sources', timeoutMs: CRUD_TIMEOUT });
}

export function addGenieSource(ctx: Ctx, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/genie/sources', method: 'POST', body, timeoutMs: CRUD_TIMEOUT });
}

export function getGenieSource(ctx: Ctx, id: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/genie/sources/${id}`, timeoutMs: CRUD_TIMEOUT });
}

export function updateGenieSource(ctx: Ctx, id: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/genie/sources/${id}`, method: 'PUT', body, timeoutMs: CRUD_TIMEOUT });
}

export function deleteGenieSource(ctx: Ctx, id: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/genie/sources/${id}`, method: 'DELETE', timeoutMs: CRUD_TIMEOUT });
}

export function analyzeGenieSource(ctx: Ctx, id: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/genie/sources/${id}/analyze`, method: 'POST', body, timeoutMs: STREAM_TIMEOUT });
}

// ─── Platform Config ─────────────────────────────────────────────────

export function getPlatformConfig(ctx: Ctx, platform: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/platform-config/${platform}`, timeoutMs: CRUD_TIMEOUT });
}

export function setPlatformConfig(ctx: Ctx, platform: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/platform-config/${platform}`, method: 'POST', body, timeoutMs: CRUD_TIMEOUT });
}

export function deletePlatformConfig(ctx: Ctx, platform: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/platform-config/${platform}`, method: 'DELETE', timeoutMs: CRUD_TIMEOUT });
}

export function refreshPlatformToken(ctx: Ctx, platform: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/platform-config/${platform}/refresh`, method: 'POST', timeoutMs: STREAM_TIMEOUT });
}

export function handlePlatformOAuth(ctx: Ctx, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/platform-oauth/callback', method: 'POST', body, timeoutMs: CRUD_TIMEOUT });
}

export function getPlatformOAuth(ctx: Ctx) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/platform-oauth/callback', timeoutMs: CRUD_TIMEOUT });
}

// ─── Publishing ──────────────────────────────────────────────────────

export function publishToPlatform(ctx: Ctx, id: string, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/publish/${id}`, method: 'POST', body, timeoutMs: STREAM_TIMEOUT });
}

export function getPublishStatus(ctx: Ctx, id: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/publish/${id}`, timeoutMs: CRUD_TIMEOUT });
}

// ─── Analytics ───────────────────────────────────────────────────────

export function getAnalytics(ctx: Ctx) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/analytics', timeoutMs: CRUD_TIMEOUT });
}

// ─── Notifications ──────────────────────────────────────────────────

export function listNotifications(ctx: Ctx) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/notifications', timeoutMs: CRUD_TIMEOUT });
}

export function createNotification(ctx: Ctx, body: unknown) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/notifications', method: 'POST', body, timeoutMs: CRUD_TIMEOUT });
}

export function markAllNotificationsRead(ctx: Ctx) {
  return proxyRequest({ ...ctxOpts(ctx), path: '/api/notifications/mark-all-read', method: 'POST', timeoutMs: CRUD_TIMEOUT });
}

export function markNotificationRead(ctx: Ctx, id: string) {
  return proxyRequest({ ...ctxOpts(ctx), path: `/api/notifications/${id}/read`, method: 'POST', timeoutMs: CRUD_TIMEOUT });
}
