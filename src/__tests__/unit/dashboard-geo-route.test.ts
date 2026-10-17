import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/proxy/zhijian-client', () => ({ proxyRequest: vi.fn() }));
import { proxyRequest } from '@/lib/proxy/zhijian-client';
import { GET } from '@/app/api/dashboard/geo/route';
describe('retired geo score mapping', () => {
  it('never maps AI platforms to websites or mentions to citation counts', async () => {
    const response = await GET(); expect(response.status).toBe(410);
    const data = await response.json(); expect(data.replacement).toBe('/dashboard');
    expect(data.websites).toBeUndefined(); expect(data.totalCitations).toBeUndefined();
    expect(proxyRequest).not.toHaveBeenCalled();
  });
});
