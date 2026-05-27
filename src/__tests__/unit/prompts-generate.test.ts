import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/integration/prompts/generate/route';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { getExternalId, syncProjectToVisibility } from '@/lib/proxy/zhijian-client';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { getWorkspaceId } from '@/lib/auth/get-workspace';

// Mock billing guard
vi.mock('@/lib/billing/guard', () => ({
  requireBilling: vi.fn(),
  BillingError: class BillingError extends Error {
    module: string;
    statusCode: number;
    constructor(msg: string, module: string) {
      super(msg);
      this.module = module;
      this.statusCode = 403;
      this.name = 'BillingError';
    }
  },
}));

// Mock zhijian-client
vi.mock('@/lib/proxy/zhijian-client', () => ({
  getExternalId: vi.fn(),
  evictCache: vi.fn(),
  syncProjectToVisibility: vi.fn(),
}));

// Mock workspace verification
vi.mock('@/lib/auth/workspace', () => ({
  verifyProjectInWorkspace: vi.fn(),
}));

// Mock getWorkspaceId
vi.mock('@/lib/auth/get-workspace', () => ({
  getWorkspaceId: vi.fn(),
}));

// Mock global fetch for upstream calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockRequest(body: Record<string, unknown>): any {
  const req = new Request('http://localhost/api/integration/prompts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Next.js adds nextUrl to the request object
  (req as any).nextUrl = new URL('http://localhost/api/integration/prompts/generate');
  return req;
}

describe('POST /api/integration/prompts/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated session
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com' },
    });

    // Default: workspace found
    (getWorkspaceId as ReturnType<typeof vi.fn>).mockResolvedValue('ws-test');

    // Default: billing passes
    (requireBilling as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Default: external mapping exists
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('9');

    // Default: syncProjectToVisibility returns numeric id
    (syncProjectToVisibility as ReturnType<typeof vi.fn>).mockResolvedValue(9);

    // Default: project belongs to workspace
    (verifyProjectInWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });

    // Default: upstream returns success
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, text: 'Generated prompt' }),
    });
  });

  afterEach(() => {
    delete process.env.SERVICE_TOKEN;
  });

  // --- Auth guards ---

  it('should return 401 when not authenticated', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 401 when session has no user id', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: {} });

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(401);
  });

  // --- Workspace guard ---

  it('should return 400 when no workspace found', async () => {
    (getWorkspaceId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('No workspace selected');
  });

  // --- ProjectId validation ---

  it('should return 400 when projectId is missing', async () => {
    const res = await POST(mockRequest({ keyword: 'test' }) as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing projectId');
  });

  // --- Billing guard ---

  it('should return 403 with NO_SUBSCRIPTION on BillingError', async () => {
    const billingErr = new BillingError('visibility');
    (requireBilling as ReturnType<typeof vi.fn>).mockRejectedValue(billingErr);

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('NO_SUBSCRIPTION');
    expect(data.module).toBe('visibility');
  });

  // --- External mapping ---

  it('should return 404 when no external mapping exists', async () => {
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('No external mapping for project');
  });

  // --- syncProjectToVisibility: numeric externalId (happy path) ---

  it('should use numeric externalId directly as projectPk', async () => {
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('42');
    (syncProjectToVisibility as ReturnType<typeof vi.fn>).mockResolvedValue(42);

    const res = await POST(mockRequest({ projectId: 'p1', keyword: 'AI' }) as any);
    expect(res.status).toBe(200);

    // Verify upstream fetch uses numeric id in URL
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/42/prompts/generate'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  // --- THE KEY DIFF CHANGE: body now includes project_id ---

  it('should include project_id in the upstream request body (NEW in this diff)', async () => {
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('9');

    const res = await POST(
      mockRequest({ projectId: 'p1', keyword: 'visibility', prompt_type: 'brand' }) as any,
    );
    expect(res.status).toBe(200);

    // This is the CRITICAL assertion for the diff change
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.project_id).toBe(9);
    expect(body.keyword).toBe('visibility');
    expect(body.prompt_type).toBe('brand');
  });

  // --- Upstream error handling ---

  it('should return 502 when upstream returns 500+', async () => {
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('9');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'internal error' }),
    });

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain('Upstream error');
  });

  it('should forward client errors (4xx) from upstream', async () => {
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('9');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'validation error' }),
    });

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(422);
  });

  it('should return 504 on upstream timeout (AbortError)', async () => {
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('9');
    const abortErr = new DOMException('Aborted', 'AbortError');
    mockFetch.mockRejectedValue(abortErr);

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(504);
    const data = await res.json();
    expect(data.error).toBe('Upstream timeout');
  });

  it('should return 502 on non-abort fetch error', async () => {
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('9');
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain('Failed to generate prompt');
  });

  // --- syncProjectToVisibility error handling ---

  it('should return 502 when syncProjectToVisibility throws', async () => {
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('ext-uuid-123');
    (syncProjectToVisibility as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Failed to create project'),
    );

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain('Failed to create project');
  });
});
