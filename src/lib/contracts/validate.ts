/**
 * 契约运行时校验：ajv 编译 contracts/ 下的 JSON Schema（缓存编译结果）。
 * Portal 侧用于校验 ContentOS 返回的数据与发往 ContentOS 的请求体。
 */

import Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';
import briefSchemaJson from '../../../contracts/content-creation-brief-v1.schema.json';
import workflowSchemaJson from '../../../contracts/content-workflow-v1.schema.json';
import capabilitiesSchemaJson from '../../../contracts/content-platform-capabilities-v1.schema.json';

const ajv = new Ajv({ strict: false, allErrors: true });

// 编译 $defs 的某个子模式：去掉根 $id 再覆盖 $ref，避免同一 $id 重复注册。
function compile(schema: object, $ref: string) {
  const { $id: _omit, ...rest } = schema as { $id?: string };
  void _omit;
  return ajv.compile({ ...rest, $ref } as object);
}

// 编译一次，模块级缓存。
const validateBrief = compile(briefSchemaJson, '#/$defs/contentCreationBriefV1');
const validateCreateBriefRequest = compile(
  briefSchemaJson,
  '#/$defs/createBriefRequestV1',
);
const validateVisibilitySnapshot = compile(
  briefSchemaJson,
  '#/$defs/visibilitySuggestionSnapshotV1',
);
const validateProjectSnapshot = compile(
  briefSchemaJson,
  '#/$defs/projectSnapshotV1',
);
const validateCreateWorkflowRequest = compile(
  workflowSchemaJson,
  '#/$defs/createWorkflowRequestV1',
);
const validateWorkflowView = compile(workflowSchemaJson, '#/$defs/workflowViewV1');
// capabilities 根模式无 $defs，直接整体编译（$ref "#" 自引用会无限递归）。
const validateCapabilities = ajv.compile(capabilitiesSchemaJson);

export interface ContractValidationResult {
  ok: boolean;
  errors: string[];
}

function toResult(validator: ValidateFunction): ContractValidationResult {
  if (!validator.errors || validator.errors.length === 0) {
    return { ok: true, errors: [] };
  }
  return {
    ok: false,
    errors: validator.errors.map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`),
  };
}

export function validateBriefV1(value: unknown): ContractValidationResult {
  validateBrief(value);
  return toResult(validateBrief);
}

export function validateCreateBriefRequestV1(value: unknown): ContractValidationResult {
  validateCreateBriefRequest(value);
  return toResult(validateCreateBriefRequest);
}

export function validateVisibilitySnapshotV1(value: unknown): ContractValidationResult {
  validateVisibilitySnapshot(value);
  return toResult(validateVisibilitySnapshot);
}

export function validateProjectSnapshotV1(value: unknown): ContractValidationResult {
  validateProjectSnapshot(value);
  return toResult(validateProjectSnapshot);
}

export function validateCreateWorkflowRequestV1(value: unknown): ContractValidationResult {
  validateCreateWorkflowRequest(value);
  return toResult(validateCreateWorkflowRequest);
}

export function validateWorkflowViewV1(value: unknown): ContractValidationResult {
  validateWorkflowView(value);
  return toResult(validateWorkflowView);
}

export function validateCapabilitiesV1(value: unknown): ContractValidationResult {
  validateCapabilities(value);
  return toResult(validateCapabilities);
}
