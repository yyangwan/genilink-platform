import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';

vi.mock('@/lib/auth/service-jwt', () => ({
  issueVisibilityProjectJWT: vi.fn().mockResolvedValue('visibility-jwt'),
}));

import { loadCanonicalSuggestion } from '@/lib/content/canonical-suggestion';

const identity = { userId: 'user-1', email: 'u@example.com', name: 'U', role: 'member' };

const rawSuggestions = [
  { id: 153, title: 'Other suggestion' },
  {
    id: 154,
    title: 'Target suggestion',
    description: 'Detailed recommendation',
    priority: 'high',
    detail: {
      evidence_summary: 'Mention rate dropped on DeepSeek',
      action_type: '发布对比页',
      evidence_sources: ['https://example.com/audit'],
    },
  },
];

describe('loadCanonicalSuggestion', () => {
  beforeEach(() => {
    vi.stubEnv('VISIBILITY_SERVICE_URL', 'http://visibility.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the mapped suggestion for a valid id', async () => {
    server.use(
      http.get('http://visibility.test/api/suggestions/project-1', ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer visibility-jwt');
        return HttpResponse.json(rawSuggestions);
      }),
    );

    const result = await loadCanonicalSuggestion({
      identity,
      workspaceId: 'ws-1',
      projectId: 'project-1',
      suggestionId: '154',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.suggestion.id).toBe('154');
      expect(result.suggestion.text).toBe('Target suggestion');
      expect(result.suggestion.action_type).toBe('发布对比页');
    }
  });

  it('returns SUGGESTION_NOT_FOUND when the id is absent from the project list', async () => {
    server.use(
      http.get('http://visibility.test/api/suggestions/project-1', () =>
        HttpResponse.json([{ id: 153, title: 'Other' }]),
      ),
    );

    const result = await loadCanonicalSuggestion({
      identity,
      workspaceId: 'ws-1',
      projectId: 'project-1',
      suggestionId: '999',
    });

    expect(result).toEqual({ ok: false, code: 'SUGGESTION_NOT_FOUND' });
  });

  it('returns SUGGESTION_NOT_FOUND for an empty suggestion id', async () => {
    const result = await loadCanonicalSuggestion({
      identity,
      workspaceId: 'ws-1',
      projectId: 'project-1',
      suggestionId: '  ',
    });
    expect(result).toEqual({ ok: false, code: 'SUGGESTION_NOT_FOUND' });
  });

  it('retries once on 5xx and succeeds on the second attempt', async () => {
    let calls = 0;
    server.use(
      http.get('http://visibility.test/api/suggestions/project-1', () => {
        calls += 1;
        if (calls === 1) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json(rawSuggestions);
      }),
    );

    const result = await loadCanonicalSuggestion({
      identity,
      workspaceId: 'ws-1',
      projectId: 'project-1',
      suggestionId: '154',
    });

    expect(calls).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('retries once on connection error then returns VISIBILITY_UNAVAILABLE', async () => {
    let calls = 0;
    server.use(
      http.get('http://visibility.test/api/suggestions/project-1', () => {
        calls += 1;
        return Response.error();
      }),
    );

    const result = await loadCanonicalSuggestion({
      identity,
      workspaceId: 'ws-1',
      projectId: 'project-1',
      suggestionId: '154',
    });

    expect(calls).toBe(2);
    expect(result).toEqual({ ok: false, code: 'VISIBILITY_UNAVAILABLE' });
  });

  it('does not retry on 4xx auth errors', async () => {
    let calls = 0;
    server.use(
      http.get('http://visibility.test/api/suggestions/project-1', () => {
        calls += 1;
        return new HttpResponse(null, { status: 403 });
      }),
    );

    const result = await loadCanonicalSuggestion({
      identity,
      workspaceId: 'ws-1',
      projectId: 'project-1',
      suggestionId: '154',
    });

    expect(calls).toBe(1);
    expect(result).toEqual({ ok: false, code: 'VISIBILITY_UNAVAILABLE' });
  });
});
