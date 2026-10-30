import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import type { GuardContext } from '@/lib/proxy/route-guard';
import { ContextConflict, freezeContextInTransaction, lockContextProject } from './project-context';

import { SCENARIOS, type Scenario } from './scenarios';
export type ConfiguredPreferences = { version: 'business-preferences-v1'; scenario_importance: Partial<Record<Scenario, number>>; reason: string };
export type BusinessPreferences = Record<string, never> | ConfiguredPreferences;
export function parsePreferences(value: unknown): BusinessPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!Object.keys(data).length) return {};
  if (Object.keys(data).some(key => !['version', 'scenario_importance', 'reason'].includes(key)) || data.version !== 'business-preferences-v1' || typeof data.reason !== 'string' || Array.from(data.reason.trim()).length < 5 || data.reason.length > 2000 || !data.scenario_importance || typeof data.scenario_importance !== 'object' || Array.isArray(data.scenario_importance)) return null;
  const entries = Object.entries(data.scenario_importance);
  if (entries.some(([key, value]) => !Object.hasOwn(SCENARIOS, key) || typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100) || entries.length > 0 && !entries.some(([, value]) => Number(value) > 0)) return null;
  return { version: 'business-preferences-v1', scenario_importance: Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))) as Partial<Record<Scenario, number>>, reason: data.reason.trim() };
}
export function preferenceView(context: { version: number; contentHash: string; businessPreferences: unknown } | null) {
  const preferences = parsePreferences(context?.businessPreferences || {});
  if (!preferences) throw new ContextConflict('已保存的偏好配置格式不正确，需要核对');
  const custom = 'version' in preferences ? preferences as ConfiguredPreferences : null;
  return { preferences, mode: custom && Object.keys(custom.scenario_importance).length ? 'custom' as const : 'neutral' as const, contextVersion: context?.version || 0, priorityPolicyVersion: `scenario-priority-v1:${context?.version || 0}:${context?.contentHash || 'neutral'}`, taxonomy: SCENARIOS, importance: Object.fromEntries(Object.keys(SCENARIOS).map(key => [key, custom?.scenario_importance[key as Scenario] ?? 50])) as Record<Scenario, number>, reason: custom?.reason || null };
}
export async function setBusinessPreferences(ctx: GuardContext, expectedVersion: number, preferences: BusinessPreferences) {
  return prisma.$transaction(async tx => {
    await lockContextProject(tx, ctx);
    const current = await tx.projectIntelligenceContext.findUnique({ where: { projectId: ctx.projectId } });
    if (current && JSON.stringify(parsePreferences(current.businessPreferences)) === JSON.stringify(preferences)) return current;
    if ((current?.version || 0) !== expectedVersion) throw new ContextConflict('配置版本已变化，请刷新后核对场景偏好');
    await tx.projectIntelligenceContext.upsert({ where: { projectId: ctx.projectId }, create: { projectId: ctx.projectId, version: 0, contentHash: '', businessPreferences: preferences as Prisma.InputJsonValue }, update: { businessPreferences: preferences as Prisma.InputJsonValue } });
    return freezeContextInTransaction(tx, ctx, expectedVersion);
  });
}
