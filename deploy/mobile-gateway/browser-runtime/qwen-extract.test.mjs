import assert from 'node:assert/strict';
import test from 'node:test';
import { extractQwenResult } from './qwen-extract.mjs';

test('keeps exact article URLs and deduplicates repeated cards', () => {
  const result = extractQwenResult({
    answer: 'answer', referenceCount: 2,
    links: [
      { title: 'one', url: 'https://example.com/article/1' },
      { title: 'duplicate', url: 'https://example.com/article/1' },
      { title: 'two', url: 'https://news.example.org/a?x=1' },
      { title: 'chat', url: 'https://www.qianwen.com/chat/1' },
    ],
  });
  assert.equal(result.source_count, 2);
  assert.equal(result.capture_status, 'complete');
  assert.deepEqual(result.sources.map(source => source.url), [
    'https://example.com/article/1', 'https://news.example.org/a?x=1',
  ]);
});

test('does not mark missing references complete', () => {
  const result = extractQwenResult({
    answer: 'answer', referenceCount: 3,
    links: [{ title: 'one', url: 'https://example.com/1' }],
  });
  assert.equal(result.source_failure_count, 2);
  assert.equal(result.capture_status, 'partial');
});
