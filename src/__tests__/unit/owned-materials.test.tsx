// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OwnedMaterials, materialSpan, type OwnedAsset } from '@/components/visibility/owned-materials';
import type { EvidenceRun } from '@/types/intelligence';
import '@testing-library/jest-dom/vitest';
const text = '🧭云衡支持30家门店，仅限专业版。';
const asset = (): OwnedAsset => ({ id: 'a'.repeat(32), asset_key: 'a'.repeat(32), version: 1, registry_brand_id: 'brand1', target_id: 'registry:brand1', title: '云衡产品规格', source_kind: 'text', url: null, status: 'captured', is_latest: true, material_hash: 'f'.repeat(64), job_state: null, error_code: null, verification: { version: 0, decision: 'unreviewed' } });
const run = { summary: { brand_presence: { targets: [{ role: 'own', registry_brand_id: 'brand1', target_id: 'registry:brand1', name: '云衡' }] } } } as EvidenceRun;
let row: OwnedAsset, facts: unknown[], posts: Record<string, unknown>[], transient: boolean, fetcher: ReturnType<typeof vi.fn>;
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  row = asset(); facts = []; posts = []; transient = false;
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
  fetcher = vi.fn(async (input: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(String(options.body)); posts.push(body);
      if (transient) { transient = false; throw Error('timeout'); }
      if (body.op === 'verify') row = { ...row, verification: { version: 1, decision: 'verified' } };
      if (body.op === 'approveFact') facts = [{ id: 'b'.repeat(32), version: 1, fact_key: 'c'.repeat(64), source_kind: 'owned_asset_revision', source_ref: { asset_id: row.id }, statement: body.quote, scope: body.scope, status: 'valid', valid_from: body.validFrom, valid_until: body.validUntil }];
      return response(row, 202);
    }
    const op = new URL(input, 'http://localhost').searchParams.get('op');
    if (op === 'text') return response({ asset: row, text });
    if (op === 'assetFacts') return response({ facts });
    return response({ items: [row], next_offset: null });
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('separates material verification from fact approval and sends exact Unicode evidence', async () => {
  render(<OwnedMaterials run={run} projectId="p1" onSaved={vi.fn()} />);
  fireEvent.click(await screen.findByText('查看材料与事实 →'));
  await screen.findByText(text);
  expect(screen.queryByRole('button', { name: '批准本条事实' })).toBeNull();
  fireEvent.change(screen.getByLabelText('适用范围与核实依据'), { target: { value: '专业版产品，负责人核对规格版本' } });
  fireEvent.click(screen.getByRole('button', { name: '核实此材料版本' }));
  await screen.findByRole('button', { name: '批准本条事实' });
  fireEvent.change(screen.getByLabelText('拟批准事实（逐字原文）'), { target: { value: text.slice(2) } });
  fireEvent.click(screen.getByRole('button', { name: '批准本条事实' }));
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1]).toMatchObject({ op: 'approveFact', start: 1, end: Array.from(text).length, expectedVerificationVersion: 1 });
  await screen.findByText('有效 · 事实版本 1');
});
it('reuses the identical body after an uncertain write and freezes editing', async () => {
  render(<OwnedMaterials run={run} projectId="p1" onSaved={vi.fn()} />);
  fireEvent.click(await screen.findByText('查看材料与事实 →'));
  await screen.findByText(text);
  fireEvent.change(screen.getByLabelText('适用范围与核实依据'), { target: { value: '专业版产品，负责人核对规格版本' } });
  transient = true;
  fireEvent.click(screen.getByRole('button', { name: '核实此材料版本' }));
  await screen.findAllByText('操作结果尚未确认，请按原请求重试，避免重复创建。');
  expect(screen.getByLabelText('适用范围与核实依据')).toBeDisabled();
  fireEvent.click(screen.getAllByRole('button', { name: '按原请求重试' })[0]);
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1]).toEqual(posts[0]);
  await screen.findByRole('button', { name: '批准本条事实' });
});
it('rejects ambiguous/fabricated quotes and preserves Python codepoint offsets', () => {
  expect(materialSpan(text, text.slice(2))).toEqual({ quote: text.slice(2), start: 1, end: Array.from(text).length });
  expect(() => materialSpan('云衡和云衡', '云衡')).toThrow();
  expect(() => materialSpan(text, '云衡支持免费版')).toThrow();
});
it('keeps old revision readable without approving it', async () => {
  row = { ...row, is_latest: false };
  render(<OwnedMaterials run={run} projectId="p1" onSaved={vi.fn()} />);
  fireEvent.click(await screen.findByText('查看材料与事实 →'));
  await screen.findByText(text);
  expect(screen.getByRole('button', { name: '核实此材料版本' })).toBeDisabled();
  expect(screen.queryByText('登记新版本 →')).toBeNull();
});
