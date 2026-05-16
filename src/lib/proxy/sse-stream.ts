/**
 * Proxy an SSE stream from an upstream service through a Next.js Response.
 * Uses ReadableStream for zero-buffering passthrough.
 */
export async function proxySSE(
  upstreamUrl: string,
  headers: Record<string, string>
): Promise<Response> {
  const upstream = await fetch(upstreamUrl, {
    headers: {
      ...headers,
      Accept: 'text/event-stream',
    },
  });

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ error: `Upstream returned ${upstream.status}` }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
