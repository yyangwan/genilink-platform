import { getWorkspaceBillingAccess } from '@/lib/billing/access';

/**
 * Get list of active module subscriptions for a user/workspace.
 * Used to set the genilink-modules cookie for middleware checks.
 */
export async function getActiveModules(userId: string, workspaceId: string): Promise<string[]> {
  return (await getWorkspaceBillingAccess(userId, workspaceId)).modules;
}
