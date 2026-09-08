/**
 * 契约一致性测试（Portal 消费者侧，设计 §18）：
 * contracts/ 目录与 ContentOS 仓库逐字节一致（SCHEMA_HASHES.json 校验），
 * fixtures 通过/按预期失败于 JSON Schema，TS 常量与 schema enum 一致。
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import {
  validateBriefV1,
  validateCapabilitiesV1,
  validateCreateBriefRequestV1,
  validateCreateWorkflowRequestV1,
  validateWorkflowViewV1,
  validateVisibilitySnapshotV1,
  validateProjectSnapshotV1,
} from '@/lib/contracts/validate';
import { SUPPORTED_GENERATION_PLATFORMS } from '@/contracts/content-creation-brief-v1';
import { buildUsageOperationId } from '@/contracts/content-workflow-v1';
import { FALLBACK_CAPABILITIES } from '@/contracts/content-platform-capabilities-v1';
import briefBaselineValid from '../../../contracts/fixtures/brief-baseline-valid.json';
import briefInvalidOutline from '../../../contracts/fixtures/brief-invalid-outline.json';
import createBriefRequestValid from '../../../contracts/fixtures/create-brief-request-valid.json';
import createWorkflowRequestValid from '../../../contracts/fixtures/create-workflow-request-valid.json';
import workflowViewPartial from '../../../contracts/fixtures/workflow-view-partial.json';
import capabilitiesValid from '../../../contracts/fixtures/capabilities-valid.json';
import workflowSchemaJson from '../../../contracts/content-workflow-v1.schema.json';

const CONTRACTS_DIR = join(__dirname, '..', '..', '..', 'contracts');

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listContractFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listContractFiles(full));
    } else if (entry.name !== 'SCHEMA_HASHES.json') {
      out.push(full);
    }
  }
  return out;
}

describe('content-creation-brief-v1 contract', () => {
  it('accepts the golden baseline brief fixture', () => {
    expect(validateBriefV1(briefBaselineValid).ok).toBe(true);
  });

  it('rejects a brief with fewer than 4 outline sections', () => {
    const result = validateBriefV1(briefInvalidOutline);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('outline'))).toBe(true);
  });

  it('accepts the golden create-brief request fixture', () => {
    expect(validateCreateBriefRequestV1(createBriefRequestValid).ok).toBe(true);
  });

  it('rejects an oversized suggestion text', () => {
    const base = createBriefRequestValid as { sourceSnapshot: Record<string, unknown> };
    const bad = {
      ...base,
      sourceSnapshot: { ...base.sourceSnapshot, text: 'x'.repeat(501) },
    };
    expect(validateCreateBriefRequestV1(bad).ok).toBe(false);
  });

  it('rejects non-http reference URLs in the snapshot', () => {
    const base = createBriefRequestValid as unknown as {
      sourceSnapshot: Record<string, unknown>;
    };
    const bad = {
      ...base,
      sourceSnapshot: { ...base.sourceSnapshot, evidenceSources: ['javascript:alert(1)'] },
    };
    expect(validateCreateBriefRequestV1(bad).ok).toBe(false);
  });

  it('rejects an unknown field in the snapshot (whitelist only)', () => {
    const base = createBriefRequestValid as unknown as {
      sourceSnapshot: Record<string, unknown>;
    };
    const bad = {
      ...base,
      sourceSnapshot: { ...base.sourceSnapshot, cookies: 'session=secret' },
    };
    expect(validateVisibilitySnapshotV1(bad.sourceSnapshot).ok).toBe(false);
  });

  it('rejects a project snapshot missing required fields', () => {
    const bad = { schemaVersion: 1, name: 'no-project-id' };
    expect(validateProjectSnapshotV1(bad).ok).toBe(false);
  });
});

describe('content-workflow-v1 contract', () => {
  it('TS platform constant matches the schema enum', () => {
    const schemaEnum = (
      workflowSchemaJson as unknown as {
        $defs: { platformEnum: { enum: string[] } };
      }
    ).$defs.platformEnum.enum;
    expect(new Set(schemaEnum)).toEqual(new Set(SUPPORTED_GENERATION_PLATFORMS));
    expect(schemaEnum).toHaveLength(4);
  });

  it('accepts the golden create-workflow request fixture', () => {
    expect(validateCreateWorkflowRequestV1(createWorkflowRequestValid).ok).toBe(true);
  });

  it('rejects unsupported platforms (zhihu) in workflow requests', () => {
    const bad = { ...(createWorkflowRequestValid as Record<string, unknown>), platforms: ['zhihu'] };
    expect(validateCreateWorkflowRequestV1(bad).ok).toBe(false);
  });

  it('rejects a malformed usageOperationId', () => {
    const bad = {
      ...(createWorkflowRequestValid as Record<string, unknown>),
      usageOperationId: 'content-workflow:ws1:not-a-hash',
    };
    expect(validateCreateWorkflowRequestV1(bad).ok).toBe(false);
  });

  it('buildUsageOperationId output passes schema validation', () => {
    const op = buildUsageOperationId('ws_6b0c2d4e5f', 'a'.repeat(64));
    const body = {
      ...(createWorkflowRequestValid as Record<string, unknown>),
      usageOperationId: op,
    };
    expect(validateCreateWorkflowRequestV1(body).ok).toBe(true);
  });

  it('accepts the golden partial workflow view fixture', () => {
    expect(validateWorkflowViewV1(workflowViewPartial).ok).toBe(true);
  });
});

describe('content-platform-capabilities-v1 contract', () => {
  it('accepts the golden capabilities fixture', () => {
    expect(validateCapabilitiesV1(capabilitiesValid).ok).toBe(true);
  });

  it('compile-time fallback only enables the four implemented platforms', () => {
    expect(validateCapabilitiesV1(FALLBACK_CAPABILITIES).ok).toBe(true);
    const enabled = Object.entries(FALLBACK_CAPABILITIES.platforms)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k)
      .sort();
    expect(enabled).toEqual(['douyin', 'wechat', 'weibo', 'xiaohongshu']);
  });
});

describe('contracts directory hash manifest', () => {
  it('SCHEMA_HASHES.json matches the sha256 of every contract file', () => {
    const manifest = JSON.parse(
      readFileSync(join(CONTRACTS_DIR, 'SCHEMA_HASHES.json'), 'utf8'),
    ) as Record<string, string>;

    const files = listContractFiles(CONTRACTS_DIR);
    expect(files.length).toBeGreaterThan(0);

    const computed: Record<string, string> = {};
    for (const file of files) {
      computed[relative(CONTRACTS_DIR, file).replace(/\\/g, '/')] = sha256File(file);
    }

    expect(Object.keys(computed).sort()).toEqual(Object.keys(manifest).sort());
    for (const [path, hash] of Object.entries(computed)) {
      expect(manifest[path], `hash mismatch for ${path}`).toBe(hash);
    }
  });
});
