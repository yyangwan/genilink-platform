import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { effectiveSystemRole, OpsAuthorizationError, requireOps } from '@/lib/auth/ops';
import { prisma } from '@/lib/db';
import { decryptContact } from '@/lib/marketing/contact-crypto';

const patchSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(['new', 'qualified', 'contacted', 'proposal', 'won', 'lost']).optional(),
  assignedUserId: z.string().min(1).nullable().optional(),
  note: z.string().trim().max(1000).optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOps();
    const { id } = await params;
    const lead = await prisma.marketingLead.findUnique({
      where: { id },
      include: {
        statusEvents: { orderBy: { createdAt: 'desc' } },
        privacyEvents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!lead) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    const { contactCiphertext, contactHash: _contactHash, ...safeLead } = lead;
    return NextResponse.json({ lead: { ...safeLead, contact: contactCiphertext ? decryptContact(contactCiphertext) : null } }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof OpsAuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Failed to read marketing lead', error);
    return NextResponse.json({ error: 'LEAD_READ_FAILED' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireOps();
    const { id } = await params;
    const input = patchSchema.parse(await request.json());
    const current = await prisma.marketingLead.findUnique({ where: { id }, select: { status: true } });
    if (!current) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    if (input.assignedUserId) {
      const assignee = await prisma.user.findUnique({ where: { id: input.assignedUserId }, select: { id: true, systemRole: true } });
      if (!assignee || !['ops', 'admin'].includes(effectiveSystemRole(assignee))) {
        return NextResponse.json({ error: 'INVALID_ASSIGNEE' }, { status: 400 });
      }
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.marketingLead.updateMany({
        where: { id, version: input.version },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId } : {}),
          ...(input.status === 'contacted' ? { lastContactedAt: new Date() } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return null;
      if (input.status && input.status !== current.status) {
        await tx.marketingLeadStatusEvent.create({
          data: { leadId: id, fromStatus: current.status, toStatus: input.status, actorUserId: actor.id, note: input.note || null },
        });
      }
      return tx.marketingLead.findUnique({ where: { id }, select: { id: true, status: true, version: true, assignedUserId: true, updatedAt: true } });
    });
    if (!updated) return NextResponse.json({ error: 'VERSION_CONFLICT' }, { status: 409 });
    return NextResponse.json({ lead: updated });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof OpsAuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
