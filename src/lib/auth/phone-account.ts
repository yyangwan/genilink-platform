import type { Prisma } from '@/generated/prisma/client';
import { displayPhone } from './phone';

export async function lockPhoneAccount(tx: Prisma.TransactionClient, phone: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`phone-account:${phone}`}, 0))`;
}

export function findPhoneAccounts(tx: Prisma.TransactionClient, phone: string) {
  return tx.user.findMany({
    where: { phone: { in: [phone, displayPhone(phone)] } },
    take: 2,
  });
}
