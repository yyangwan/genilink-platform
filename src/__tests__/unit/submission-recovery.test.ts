// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingSubmission,
  loadPendingSubmission,
  savePendingSubmission,
} from '@/lib/content/submission-recovery';

describe('submission recovery（评审 R3）', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips the key and body snapshot for the same brief', () => {
    savePendingSubmission('brief_1', {
      key: 'idem-key-1',
      body: { briefId: 'brief_1', briefRevision: 3, platforms: ['wechat'] },
      savedAt: Date.now(),
    });

    const loaded = loadPendingSubmission('brief_1');
    expect(loaded?.key).toBe('idem-key-1');
    expect(loaded?.body).toEqual({ briefId: 'brief_1', briefRevision: 3, platforms: ['wechat'] });
  });

  it('scopes entries per brief and clears them independently', () => {
    savePendingSubmission('brief_1', { key: 'k1', body: {}, savedAt: Date.now() });
    savePendingSubmission('brief_2', { key: 'k2', body: {}, savedAt: Date.now() });

    clearPendingSubmission('brief_1');

    expect(loadPendingSubmission('brief_1')).toBeNull();
    expect(loadPendingSubmission('brief_2')?.key).toBe('k2');
  });

  it('expires stale submissions beyond the TTL instead of recovering them', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-10T10:00:00Z').getTime());
    savePendingSubmission('brief_1', { key: 'k1', body: {}, savedAt: Date.now() });
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-10T11:00:00Z').getTime());

    expect(loadPendingSubmission('brief_1')).toBeNull();
    vi.mocked(Date.now).mockRestore();
  });

  it('returns null for corrupted payloads', () => {
    sessionStorage.setItem('content-submit:brief_1', '{not-json');
    expect(loadPendingSubmission('brief_1')).toBeNull();
  });
});
