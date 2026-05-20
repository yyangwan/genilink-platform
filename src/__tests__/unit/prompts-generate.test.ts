import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/integration/prompts/generate/route';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { getExternalId } from '@/lib/proxy/zhijian-client';

// Mock cookies from next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: 'ws-test' }),
  }),
}));

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
}));

// Mock global fetch for upstream calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/integration/prompts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/integration/prompts/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated session
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com' },
    });

    // Default: billing passes
    (requireBilling as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Default: external mapping exists
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('9');

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

  it('should return 400 when no workspace cookie', async () => {
    const { cookies } = await import('next/headers');
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: vi.fn().mockReturnValue(undefined),
    });

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
    const billingErr = new BillingError('No active subscription for module: visibility', 'visibility');
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

  // --- resolveVisibilityProjectId: numeric externalId (happy path) ---

  it('should use numeric externalId directly as projectPk', async () => {
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('42');

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

  // --- resolveVisibilityProjectId: non-numeric externalId triggers auto-create ---

  it('should auto-create visibility project when externalId is not numeric', async () => {
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('ext-uuid-123');
    // Mock prisma for auto-create path
    (prisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      name: 'Test Project',
      industry: 'tech',
    });
    (prisma.externalResourceMapping.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // SERVICE_TOKEN is required for auto-create path
    process.env.SERVICE_TOKEN = 'test-service-token';
    const _prevToken = process.env.SERVICE_TOKEN;

    // First fetch = create project on visibility service
    // Second fetch = actual generate call
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 99 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, text: 'prompt' }),
      });

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(200);

    // First call should be creating the project
    const createCall = mockFetch.mock.calls[0];
    expect(createCall[0]).toContain('/api/projects');
    expect(createCall[1].method).toBe('POST');
  });

  it('should return 502 when auto-create visibility project fails', async () => {
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('ext-uuid-456');
    process.env.SERVICE_TOKEN = 'test-service-token';
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const res = await POST(mockRequest({ projectId: 'p1' }) as any);
    expect(res.status).toBe(502);
  });
});
