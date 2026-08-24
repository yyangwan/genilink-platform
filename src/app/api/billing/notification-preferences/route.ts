import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { maskPhone, normalizePhone } from '@/lib/auth/phone';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }
  const enabled = typeof body === 'object' && body !== null
    ? (body as { renewalReminderSmsEnabled?: unknown }).renewalReminderSmsEnabled
    : undefined;
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: '提醒设置不正确' }, { status: 400 });
  }

  const now = new Date();
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { renewalReminderSmsEnabled: enabled },
      select: { phone: true, renewalReminderSmsEnabled: true },
    });
    await tx.billingNotification.updateMany({
      where: {
        userId,
        type: { startsWith: 'renewal_due_' },
        status: enabled ? 'suppressed' : 'scheduled',
        ...(enabled ? { scheduledAt: { gte: now } } : {}),
      },
      data: { status: enabled ? 'scheduled' : 'suppressed' },
    });
    return updated;
  });
  const phone = normalizePhone(user.phone);
  return NextResponse.json({
    phoneMasked: phone ? maskPhone(phone) : '未绑定',
    renewalReminderSmsEnabled: user.renewalReminderSmsEnabled,
  });
}
