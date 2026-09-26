import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/auth/service-jwt', () => ({ issueVisibilityProjectJWT: vi.fn() }));

import { terminalEventName } from '@/lib/marketing/maintenance';

describe('marketing maintenance', () => {
  it('maps only terminal analysis states to authoritative funnel events', () => {
    expect(terminalEventName('completed')).toBe('diagnosis_completed');
    expect(terminalEventName('partial')).toBe('diagnosis_completed');
    expect(terminalEventName('failed')).toBe('diagnosis_failed');
    expect(terminalEventName('scoring')).toBeNull();
  });
});
