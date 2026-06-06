import { describe, it, expect } from 'vitest';
import { getAuditStatus, isAuditFinished, isAuditInProgress } from '@/lib/audit-status';

describe('audit status helpers', () => {
  it('normalizes phase over status', () => {
    expect(getAuditStatus({ phase: 'completed', status: 'pending' })).toBe('completed');
  });

  it('treats partial audits as finished', () => {
    expect(isAuditFinished('partial')).toBe(true);
    expect(isAuditFinished('completed')).toBe(true);
    expect(isAuditFinished('failed')).toBe(false);
  });

  it('detects in-progress audits', () => {
    expect(isAuditInProgress('pending')).toBe(true);
    expect(isAuditInProgress('running')).toBe(true);
    expect(isAuditInProgress('completed')).toBe(false);
  });
});

