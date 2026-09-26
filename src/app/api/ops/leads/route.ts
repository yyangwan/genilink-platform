import { NextRequest, NextResponse } from 'next/server';
import { OpsAuthorizationError, requireOps } from '@/lib/auth/ops';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await requireOps();
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const grade = request.nextUrl.searchParams.get('grade') || undefined;
    const leads = await prisma.marketingLead.findMany({
      where: { ...(status ? { status } : {}), ...(grade ? { grade } : {}) },
      select: {
        id: true, kind: true, companyName: true, website: true, industry: true,
        score: true, grade: true, status: true, version: true, assignedUserId: true,
        lastContactedAt: true, createdAt: true, updatedAt: true,
      },
      orderBy: [{ grade: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return NextResponse.json({ leads }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof OpsAuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
