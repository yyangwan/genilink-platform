import type { Execution, ExecutionEvent, ExecutionSnapshot } from '@/lib/visibility/execution-contract';
import { actionId } from './task-workspace';
export const emptyExecution: ExecutionSnapshot = { status: 'not_started', owner: null, due_at: null, delivery: null, acceptance: null };
export function execution(overrides: Partial<Execution> = {}): Execution {
  return { action_id: actionId, revision_id: '1'.repeat(32), revision: 1, version: 0, is_current: true, plan_approval_valid: true,
    publication_allowed: false, acceptance_is_visibility_improvement: false, can_write: true, can_review: true, can_manage: true, actor_id: 'user', snapshot: structuredClone(emptyExecution), ...overrides };
}
export function executionEvent(version: number, snapshot: ExecutionSnapshot, operation = 'assign'): ExecutionEvent {
  return { id: version.toString(16).padStart(32, '0'), version, operation, actor_id: 'user', actor_role: 'owner', reason: `第${version}次核对本修订的执行与交付`, created_at: '2026-10-26T08:00:00Z', before: structuredClone(emptyExecution), after: structuredClone(snapshot), integrity_valid: true };
}
