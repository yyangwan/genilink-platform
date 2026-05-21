import { NextRequest } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { generateContent } from '@/lib/content/service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    return generateContent(ctx.projectId, id, payload);
  }, { action: 'write' })(req);
}
