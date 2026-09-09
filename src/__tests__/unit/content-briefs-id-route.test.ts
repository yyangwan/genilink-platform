import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/content-auth', () => ({
  withContentAuth: (handler: unknown) => async (req: NextRequest) =>
    (handler as (ctx: unknown, req: NextRequest) => Promise<Response>)(
      {
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        role: 'member',
        serviceToken: 'content-jwt',
      },
      req,
    ),
}));

vi.mock('@/lib/content/contentos-brief-client', () => ({
  ContentOSBriefError: class extends Error {
    status: number;
    code: string;
    details?: unknown;
    constructor(status: number, code: string, message: string, details?: unknown) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
  getBrief: vi.fn(),
  patchBrief: vi.fn(),
}));

import { getBrief, patchBrief } from '@/lib/content/contentos-brief-client';
import { GET, PATCH } from '@/app/api/content/briefs/[id]/route';

const params = Promise.resolve({ id: 'brief_1' });

describe('GET /api/content/briefs/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the brief scoped to the current project', async () => {
    vi.mocked(getBrief).mockResolvedValue({
      data: { id: 'brief_1', projectId: 'project-1', revision: 1 },
      replayed: false,
    });
    const res = await GET(
      new NextRequest('http://localhost/api/content/briefs/brief_1?projectId=project-1'),
      { params },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe('brief_1');
    expect(getBrief).toHaveBeenCalledWith(
      { projectId: 'project-1', serviceToken: 'content-jwt' },
      'brief_1',
    );
  });

  it('rejects a brief belonging to a different project', async () => {
    vi.mocked(getBrief).mockResolvedValue({
      data: { id: 'brief_1', projectId: 'project-other' },
      replayed: false,
    });
    const res = await GET(
      new NextRequest('http://localhost/api/content/briefs/brief_1?projectId=project-1'),
      { params },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('BRIEF_PROJECT_MISMATCH');
  });

  it('maps 404 from ContentOS', async () => {
    const { ContentOSBriefError } = await import('@/lib/content/contentos-brief-client');
    vi.mocked(getBrief).mockRejectedValue(
      new ContentOSBriefError(404, 'BRIEF_NOT_FOUND', '不存在'),
    );
    const res = await GET(
      new NextRequest('http://localhost/api/content/briefs/brief_1?projectId=project-1'),
      { params },
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/content/briefs/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards the idempotency key and body', async () => {
    vi.mocked(patchBrief).mockResolvedValue({
      data: { id: 'brief_1', revision: 2 },
      replayed: false,
    });
    const req = new NextRequest('http://localhost/api/content/briefs/brief_1?projectId=project-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'key-9' },
      body: JSON.stringify({ expectedRevision: 1, editorial: { topic: '新主题' } }),
    });
    const res = await PATCH(req, { params });

    expect(res.status).toBe(200);
    expect(patchBrief).toHaveBeenCalledWith(
      { projectId: 'project-1', serviceToken: 'content-jwt' },
      'brief_1',
      { expectedRevision: 1, editorial: { topic: '新主题' } },
      'key-9',
    );
  });

  it('passes through 409 version conflict with currentRevision', async () => {
    const { ContentOSBriefError } = await import('@/lib/content/contentos-brief-client');
    vi.mocked(patchBrief).mockRejectedValue(
      new ContentOSBriefError(409, 'BRIEF_VERSION_CONFLICT', '冲突', {
        currentRevision: 5,
      }),
    );
    const req = new NextRequest('http://localhost/api/content/briefs/brief_1?projectId=project-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'key-9' },
      body: JSON.stringify({ expectedRevision: 1 }),
    });
    const res = await PATCH(req, { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('BRIEF_VERSION_CONFLICT');
    expect(body.error.currentRevision).toBe(5);
  });

  it('requires an idempotency key', async () => {
    const req = new NextRequest('http://localhost/api/content/briefs/brief_1?projectId=project-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 1 }),
    });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
  });
});
