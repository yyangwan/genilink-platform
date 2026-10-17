export interface ContentWorkbench {
  schema: 'citation-content-workbench-1'; project_id: string; enabled: boolean;
  cursor: string | null; approval_id: string | null; next_cursor: string | null;
  publication_allowed: false; context_sync_pending?: boolean; can_prepare?: boolean; can_manage_tasks?: boolean;
  items: Array<{ id: string; action_id: string; version: number; created_at: string; expires_at: string;
    title: string; status: 'ready' | 'stale' | 'expired' | 'invalid'; run_id: string | null; audit_id: string | null;
    execution: { channel: string; mode: 'generate_draft' | 'manual_task' } | null;
    ai_targets: Array<{ platform: string; prompt: string }>; fact_count: number }>;
}
