export interface ProxyRequestOptions {
  projectId: string;
  service: 'visibility' | 'content';
  path: string;
  accessToken?: string;
  body?: unknown;
  method?: string;
  /** Override default timeout in ms */
  timeoutMs?: number;
}

const SERVICE_URLS: Record<ProxyRequestOptions['service'], string> = {
  visibility: process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000',
  content: process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4002',
};

const TIMEOUT_MS = 120_000;

function getUrl(opts: ProxyRequestOptions): string {
  return `${SERVICE_URLS[opts.service]}${opts.path}`.replace(':id', opts.projectId);
}

function getHeaders(
  opts: ProxyRequestOptions,
  accept?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accept) headers.Accept = accept;
  if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
  if (opts.service === 'content') headers['X-ContentOS-Project-Id'] = opts.projectId;
  return headers;
}

export async function proxyRequest<T = unknown>(opts: ProxyRequestOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);

  try {
    const res = await fetch(getUrl(opts), {
      method: opts.method || 'GET',
      headers: getHeaders(opts),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.status === 401) throw new Error('AUTH_EXPIRED');
    if (res.status === 403) throw new Error('ACCESS_DENIED');
    if (res.status === 404) throw new Error('NOT_FOUND');
    if (!res.ok) throw new Error(`UPSTREAM_ERROR_${res.status}`);

    return (await res.json()) as T;
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') throw new Error('TIMEOUT');
    throw err;
  }
}

/**
 * Pipes an upstream SSE response through without buffering.
 */
export async function proxyStreamRequest(opts: ProxyRequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);

  try {
    const res = await fetch(getUrl(opts), {
      method: opts.method || 'POST',
      headers: getHeaders(opts, 'text/event-stream'),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.status === 401) {
      return new Response(JSON.stringify({ error: 'AUTH_EXPIRED' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    if (res.status === 403) {
      return new Response(JSON.stringify({ error: 'ACCESS_DENIED' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    if (res.status === 404) {
      return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `UPSTREAM_ERROR_${res.status}` }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(res.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'TIMEOUT' }), { status: 504, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
