import { describe, expect, it } from 'vitest';
import { looksGenericPrompt, shouldRegeneratePrompts } from '@/lib/prompts/prompt-generation';

describe('prompt-generation heuristics', () => {
  it('flags obvious generic prompts', () => {
    expect(looksGenericPrompt('generic product query')).toBe(true);
    expect(looksGenericPrompt('Explain the sample product positioning')).toBe(true);
    expect(looksGenericPrompt('Tell me about our product launch')).toBe(false);
  });

  it('regenerates when prompts do not mention the product context', () => {
    expect(
      shouldRegeneratePrompts(
        [{ text: 'generic product query' }],
        { productName: 'Alpha product', projectName: 'Project Alpha' },
      ),
    ).toBe(true);
  });

  it('keeps prompts that already mention the product name', () => {
    expect(
      shouldRegeneratePrompts(
        [{ text: 'Please generate prompts for Alpha product' }],
        { productName: 'Alpha product', projectName: 'Project Alpha' },
      ),
    ).toBe(false);
  });
});
