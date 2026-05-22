import { proxyRequest, proxyStreamRequest } from '@/lib/proxy/zhijian-client';

const TOKEN = () => process.env.SERVICE_TOKEN;
const SERVICE = 'content' as const;

export const CRUD_TIMEOUT = 30_000;
export const STREAM_TIMEOUT = 180_000;

export function listContents(projectId: string, externalId: string) {
  return proxyRequest({ projectId, service: SERVICE, path: '/api/projects/:id/contents', accessToken: TOKEN(), externalId, timeoutMs: CRUD_TIMEOUT });
}

export function createContent(projectId: string, externalId: string, body: unknown) {
  return proxyRequest({ projectId, service: SERVICE, path: '/api/projects/:id/contents', method: 'POST', body, accessToken: TOKEN(), externalId, timeoutMs: CRUD_TIMEOUT });
}

export function getContent(projectId: string, externalId: string, contentId: string) {
  return proxyRequest({ projectId, service: SERVICE, path: `/api/contents/${contentId}`, accessToken: TOKEN(), externalId, timeoutMs: CRUD_TIMEOUT });
}

export function updateContent(projectId: string, externalId: string, contentId: string, body: unknown) {
  return proxyRequest({ projectId, service: SERVICE, path: `/api/contents/${contentId}`, method: 'PUT', body, accessToken: TOKEN(), externalId, timeoutMs: CRUD_TIMEOUT });
}

export function deleteContent(projectId: string, externalId: string, contentId: string) {
  return proxyRequest({ projectId, service: SERVICE, path: `/api/contents/${contentId}`, method: 'DELETE', accessToken: TOKEN(), externalId, timeoutMs: CRUD_TIMEOUT });
}

export function generateContent(projectId: string, externalId: string, contentId: string, body: unknown) {
  return proxyStreamRequest({ projectId, service: SERVICE, path: `/api/contents/${contentId}/generate`, method: 'POST', body, accessToken: TOKEN(), externalId, timeoutMs: STREAM_TIMEOUT });
}

export function publishContent(projectId: string, externalId: string, contentId: string, body: unknown) {
  return proxyRequest({ projectId, service: SERVICE, path: `/api/contents/${contentId}/publish`, method: 'POST', body, accessToken: TOKEN(), externalId, timeoutMs: CRUD_TIMEOUT });
}

export function scoreContent(projectId: string, externalId: string, contentId: string) {
  return proxyRequest({ projectId, service: SERVICE, path: `/api/contents/${contentId}/score`, method: 'POST', accessToken: TOKEN(), externalId, timeoutMs: CRUD_TIMEOUT });
}
