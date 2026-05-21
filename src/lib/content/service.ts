import { proxyRequest, proxyStreamRequest } from '@/lib/proxy/zhijian-client';

const TOKEN = () => process.env.SERVICE_TOKEN;
const SERVICE = 'content' as const;

export function listContents(projectId: string) {
  return proxyRequest({
    projectId,
    service: SERVICE,
    path: '/api/projects/:id/contents',
    accessToken: TOKEN(),
  });
}

export function createContent(projectId: string, body: unknown) {
  return proxyRequest({
    projectId,
    service: SERVICE,
    path: '/api/projects/:id/contents',
    method: 'POST',
    body,
    accessToken: TOKEN(),
  });
}

export function getContent(projectId: string, contentId: string) {
  return proxyRequest({
    projectId,
    service: SERVICE,
    path: `/api/contents/${contentId}`,
    accessToken: TOKEN(),
  });
}

export function updateContent(projectId: string, contentId: string, body: unknown) {
  return proxyRequest({
    projectId,
    service: SERVICE,
    path: `/api/contents/${contentId}`,
    method: 'PUT',
    body,
    accessToken: TOKEN(),
  });
}

export function deleteContent(projectId: string, contentId: string) {
  return proxyRequest({
    projectId,
    service: SERVICE,
    path: `/api/contents/${contentId}`,
    method: 'DELETE',
    accessToken: TOKEN(),
  });
}

export function generateContent(projectId: string, contentId: string, body: unknown) {
  return proxyStreamRequest({
    projectId,
    service: SERVICE,
    path: `/api/contents/${contentId}/generate`,
    method: 'POST',
    body,
    accessToken: TOKEN(),
  });
}

export function publishContent(projectId: string, contentId: string, body: unknown) {
  return proxyRequest({
    projectId,
    service: SERVICE,
    path: `/api/contents/${contentId}/publish`,
    method: 'POST',
    body,
    accessToken: TOKEN(),
  });
}

export function scoreContent(projectId: string, contentId: string) {
  return proxyRequest({
    projectId,
    service: SERVICE,
    path: `/api/contents/${contentId}/score`,
    method: 'POST',
    accessToken: TOKEN(),
  });
}
