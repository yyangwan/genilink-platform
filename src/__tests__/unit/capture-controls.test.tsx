// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CaptureControls } from '@/components/visibility/capture-controls';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('capture operation identity', () => {
  function setup(outcomes: Array<Response | Error>) {
    const requests: Array<{ idempotencyKey: string; promptIds: number[] }> = [];
    const onCreated = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return Response.json([{ id: 1, text: '有哪些方案' }]);
      requests.push(JSON.parse(String(init.body)));
      const outcome = outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      if (!outcome) throw new Error('Unexpected capture request');
      return outcome;
    }));
    render(<CaptureControls projectId="p1" enabled onCreated={onCreated} />);
    return { requests, onCreated };
  }

  async function start() {
    const button = await screen.findByRole('button', { name: '开始多轮采集' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
  }

  it('starts a new audit with a new key after an acknowledged successful capture', async () => {
    const { requests, onCreated } = setup([
      Response.json({ audit_id: '12' }), Response.json({ audit_id: '13' }),
    ]);
    await start();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('12'));
    await start();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('13'));
    expect(requests).toHaveLength(2);
    expect(requests[0].promptIds).toEqual(requests[1].promptIds);
    expect(requests[0].idempotencyKey).toBeTruthy();
    expect(requests[1].idempotencyKey).not.toBe(requests[0].idempotencyKey);
  });

  it.each(['server', 'network', 'missing-receipt'] as const)('reuses the key after an uncertain %s failure', async kind => {
    const failure = kind === 'server' ? Response.json({ error: '尚待确认' }, { status: 503 })
      : kind === 'network' ? new Error('连接中断') : Response.json({ status: 'pending' });
    const { requests, onCreated } = setup([failure, Response.json({ audit_id: '12' })]);
    await start();
    await screen.findByRole('alert');
    expect(onCreated).not.toHaveBeenCalled();
    await start();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('12'));
    expect(requests).toHaveLength(2);
    expect(requests[1].idempotencyKey).toBe(requests[0].idempotencyKey);
  });
});
