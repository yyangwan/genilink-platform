import { prisma } from '@/lib/db';

export const CONVERSION_EVENTS = [
  'diagnosis_intent_created',
  'project_created_from_intent',
  'diagnosis_started',
  'diagnosis_completed',
  'lead_submitted',
  'checkout_completed',
] as const;

export async function getConversionSummary(days = 30, now = new Date()) {
  const boundedDays = Number.isInteger(days) ? Math.min(90, Math.max(1, days)) : 30;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - boundedDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.funnelDailyMetric.findMany({
    where: { metricDate: { gte: start, lt: end }, eventName: { in: [...CONVERSION_EVENTS] } },
    orderBy: [{ metricDate: 'asc' }, { eventName: 'asc' }],
  });
  const totals = Object.fromEntries(CONVERSION_EVENTS.map((event) => [event, 0])) as Record<(typeof CONVERSION_EVENTS)[number], number>;
  const channels = new Map<string, { source: string; medium: string; campaign: string; events: typeof totals }>();
  for (const row of rows) {
    const eventName = row.eventName as (typeof CONVERSION_EVENTS)[number];
    if (!(eventName in totals)) continue;
    totals[eventName] += row.eventCount;
    const key = `${row.source}\u0000${row.medium}\u0000${row.campaign}`;
    const channel = channels.get(key) || {
      source: row.source || '(direct)', medium: row.medium || '', campaign: row.campaign || '',
      events: Object.fromEntries(CONVERSION_EVENTS.map((event) => [event, 0])) as typeof totals,
    };
    channel.events[eventName] += row.eventCount;
    channels.set(key, channel);
  }
  return {
    start,
    end,
    days: boundedDays,
    totals,
    channels: [...channels.values()].sort((a, b) => b.events.diagnosis_intent_created - a.events.diagnosis_intent_created).slice(0, 50),
  };
}
