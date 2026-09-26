import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OpsAuthorizationError, requireAdmin } from '@/lib/auth/ops';
import { prisma } from '@/lib/db';

const schema = z.object({
  role: z.enum(['user', 'ops', 'admin']),
  reason: z.string().trim().min(3).max(500),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin();
    const { id } = await params;
    const input = schema.parse(await request.json());
    const current = await prisma.user.findUnique({ where: { id }, select: { id: true, systemRole: true } });
    if (!current) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    if (current.systemRole === input.role) {
      return NextResponse.json({ user: current }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { systemRole: input.role },
        select: { id: true, name: true, email: true, systemRole: true, updatedAt: true },
      });
      await tx.systemRoleAudit.create({
        data: {
          targetUserId: id,
          actorUserId: actor.id,
          fromRole: current.systemRole,
          toRole: input.role,
          reason: input.reason,
        },
      });
      return updated;
    });
    return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof OpsAuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Failed to update system role', error);
    return NextResponse.json({ error: 'ROLE_UPDATE_FAILED' }, { status: 500 });
  }
}
