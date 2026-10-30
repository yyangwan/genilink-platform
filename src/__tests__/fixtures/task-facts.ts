import type { FactCollection } from '@/lib/visibility/fact-reader';
import { actionId, project } from './task-workspace';
export const factId = 'd'.repeat(32);
export function factPage(): FactCollection {
  return { version: 'fact-qualification-v1', action_id: actionId, revision: 1, revision_id: '1'.repeat(32), projection_hash: '5'.repeat(64),
    can_write: true, total: 1, next_offset: null, selection_is_not_content_authorization: true, semantic_fit: 'requires_named_review',
    items: [{ id: factId, selected: false, eligible: true, status: 'valid', version: 1, statement: '专业版支持总部与门店权限分离。', scope: '仅适用中国大陆专业版',
      eligibility_reason: 'same_own_brand_requires_scope_review', semantic_fit: 'requires_named_review', valid_from: '2026-01-01T00:00:00Z', valid_until: '2099-12-31T00:00:00Z',
      qualification: { policy: 'fact-qualification-v1', source_valid: true, semantic_fit: 'not_verified' }, source_ref: { kind: 'owned_asset_revision', asset_id: 'material-1', asset_revision: 2, verification_id: 'verified-1',
        evidence: { project_id: project, run_id: null, owner_kind: 'owned_asset', owner_id: 'material-1', segment_id: null, text_hash: '0'.repeat(64), quote: '专业版支持总部与门店权限分离。', start: 0, end: 17 } } }],
  };
}
