import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

describe('public marketing routes', () => {
  it('allows anonymous visitors to open the pricing guide', async () => {
    const response = await proxy(new NextRequest('https://genilink.cn/pricing-guide'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
