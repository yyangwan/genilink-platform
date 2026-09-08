import { describe, expect, it } from 'vitest';
import {
  assertSnapshotLimits,
  buildProjectSnapshot,
  buildSourceSnapshot,
  computeSourceHash,
  filterReferenceUrls,
  isAllowedReferenceUrl,
} from '@/lib/content/source-snapshot';
import type { MappedSuggestion } from '@/lib/content/canonical-suggestion';
import { validateVisibilitySnapshotV1 } from '@/lib/contracts/validate';

function baseSuggestion(): MappedSuggestion {
  return {
    id: '154',
    report_id: 88,
    audit_id: 31,
    text: '建立品牌百科词条，提升 AI 助手引用',
    description: '描述',
    category: '引用可见性',
    platform: '知乎',
    priority: 'high',
    status: 'pending',
    evidence_sources: ['https://example.com/audit'],
    evidence_channels: ['知乎'],
    action_sources: ['https://example.com/baike'],
    action_channels: ['内容'],
    action_type: 'content_publish',
    type_tags: ['百科'],
    keywords: ['AI 搜索'],
    content_outline: '品牌定位、核心能力',
    weekly_tasks: [],
    competitor_reference: '',
    expected_result: '引用频率提升',
    evidence_summary: 'DeepSeek 未引用',
    audit_findings: ['DeepSeek 未引用自有内容'],
    success_metric: '引用率观察值',
    audit_evidence: [],
    acceptance_criteria: ['词条上线'],
    measurement_plan: '每周记录',
  };
}

describe('buildSourceSnapshot', () => {
  it('produces a schema-valid whitelist snapshot', () => {
    const snapshot = buildSourceSnapshot(baseSuggestion());
    expect(validateVisibilitySnapshotV1(snapshot).ok).toBe(true);
    expect(snapshot.suggestionId).toBe('154');
    expect(snapshot.requestedChannels).toEqual(['内容', '知乎']);
  });

  it('drops unsafe URLs from source arrays', () => {
    const suggestion = baseSuggestion();
    suggestion.evidence_sources = [
      'https://example.com/ok',
      'javascript:alert(1)',
      'http://localhost:3000/admin',
      'http://192.168.1.5/panel',
      'https://user:pass@example.com/creds',
      'not-a-url',
    ];
    const snapshot = buildSourceSnapshot(suggestion);
    expect(snapshot.evidenceSources).toEqual(['https://example.com/ok']);
  });

  it('omits empty optional fields instead of writing empty strings', () => {
    const suggestion = baseSuggestion();
    suggestion.description = '';
    suggestion.expected_result = '';
    const snapshot = buildSourceSnapshot(suggestion);
    expect(snapshot.description).toBeUndefined();
    expect(snapshot.expectedResult).toBeUndefined();
  });
});

describe('isAllowedReferenceUrl / filterReferenceUrls', () => {
  it('rejects non-http protocols, private hosts, and credentialed URLs', () => {
    expect(isAllowedReferenceUrl('https://example.com/a')).toBe(true);
    expect(isAllowedReferenceUrl('http://example.com/a')).toBe(true);
    expect(isAllowedReferenceUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedReferenceUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedReferenceUrl('http://127.0.0.1:8000/x')).toBe(false);
    expect(isAllowedReferenceUrl('http://10.0.0.1/x')).toBe(false);
    expect(isAllowedReferenceUrl('http://172.16.0.1/x')).toBe(false);
    expect(isAllowedReferenceUrl('http://[::1]/x')).toBe(false);
    expect(isAllowedReferenceUrl('http://db.local/x')).toBe(false);
    expect(isAllowedReferenceUrl('https://u:p@example.com/x')).toBe(false);
    expect(isAllowedReferenceUrl('https://example.com/' + 'a'.repeat(2100))).toBe(false);
  });

  it('dedupes and caps the reference list at 20', () => {
    const urls = Array.from({ length: 25 }, (_, i) => `https://example.com/p/${i}`);
    urls.push('https://example.com/p/1');
    const filtered = filterReferenceUrls(urls);
    expect(filtered).toHaveLength(20);
    expect(new Set(filtered).size).toBe(20);
  });
});

describe('buildProjectSnapshot', () => {
  it('maps the project row and rejects a non-http project url', () => {
    const snapshot = buildProjectSnapshot({
      id: 'project-1',
      name: '示例项目',
      url: 'ftp://internal/repo',
      industry: '企业服务',
      productName: '示例产品',
      productKeywords: ['AI 搜索', '品牌可见性', 'AI 搜索'],
      productDescription: '描述',
    });
    expect(snapshot.url).toBeUndefined();
    expect(snapshot.productKeywords).toEqual(['AI 搜索', '品牌可见性']);
  });
});

describe('computeSourceHash', () => {
  it('is stable across key order and ignores undefined values', () => {
    const snapshot = buildSourceSnapshot(baseSuggestion());
    const reordered = JSON.parse(
      JSON.stringify(
        Object.fromEntries(Object.entries(snapshot).reverse()),
        (_k, v) => v,
      ),
    );
    // JSON round-trip drops undefined — stableStringify must ignore them too.
    expect(computeSourceHash(reordered as typeof snapshot)).toBe(computeSourceHash(snapshot));
    expect(computeSourceHash(snapshot)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the suggestion text changes', () => {
    const a = buildSourceSnapshot(baseSuggestion());
    const b = buildSourceSnapshot(baseSuggestion());
    b.text = '修改后的建议';
    expect(computeSourceHash(a)).not.toBe(computeSourceHash(b));
  });
});

describe('assertSnapshotLimits', () => {
  it('passes for a normal snapshot', () => {
    expect(assertSnapshotLimits(buildSourceSnapshot(baseSuggestion()))).toEqual([]);
  });

  it('reports text length violations by field name', () => {
    const snapshot = buildSourceSnapshot(baseSuggestion());
    snapshot.text = '长'.repeat(501);
    expect(assertSnapshotLimits(snapshot)).toContain('text');
  });

  it('reports description length violations', () => {
    const snapshot = buildSourceSnapshot(baseSuggestion());
    snapshot.description = '长'.repeat(4001);
    expect(assertSnapshotLimits(snapshot)).toContain('description');
  });

  it('reports total payload overflow as $payload', () => {
    const snapshot = buildSourceSnapshot(baseSuggestion());
    snapshot.description = '长'.repeat(20000);
    snapshot.evidenceSummary = '长'.repeat(20000);
    snapshot.contentOutline = '长'.repeat(20000);
    snapshot.measurementPlan = '长'.repeat(20000);
    snapshot.expectedResult = '长'.repeat(20000);
    expect(assertSnapshotLimits(snapshot)).toContain('$payload');
  });
});
