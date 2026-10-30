import { SCENARIOS, type Scenario } from './scenarios';
export interface PromptSpan { quote: string; start: number; end: number }
export interface QuestionReview { status: 'confirmed' | 'needs_review'; primaryScenario: Scenario | null; secondaryScenarios: Scenario[]; brandScope: 'neutral' | 'directed' | 'uncertain'; brandReferences: PromptSpan[]; intent?: string | null; audience?: PromptSpan[]; usageContext?: PromptSpan[]; requirements: PromptSpan[]; constraints?: PromptSpan[] }
export function quoteSpans(prompt: string, input: string): PromptSpan[] {
  return [...new Set(input.split('\n').map(row => row.trim()).filter(Boolean))].map(quote => {
    const start = prompt.indexOf(quote);
    if (start < 0 || prompt.indexOf(quote, start + 1) >= 0) throw Error('需求和品牌原文必须逐字来自本题，重复片段请补充上下文。');
    const offset = Array.from(prompt.slice(0, start)).length;
    return { quote, start: offset, end: offset + Array.from(quote).length };
  });
}
export function validQuestionContexts(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 100) return false;
  return entries.every(([key, raw]) => {
    if (!/^[a-f0-9]{64}$/.test(key) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const row = raw as Record<string, unknown>;
    if (Object.keys(row).some(key => !['status', 'primaryScenario', 'secondaryScenarios', 'brandScope', 'brandReferences', 'intent', 'audience', 'usageContext', 'requirements', 'constraints'].includes(key))) return false;
    if (!['confirmed', 'needs_review'].includes(String(row.status)) || !['neutral', 'directed', 'uncertain'].includes(String(row.brandScope)) || row.primaryScenario !== null && !Object.hasOwn(SCENARIOS, String(row.primaryScenario))) return false;
    if (!Array.isArray(row.secondaryScenarios) || row.secondaryScenarios.length > 7 || row.secondaryScenarios.some(key => !Object.hasOwn(SCENARIOS, String(key))) || new Set(row.secondaryScenarios).size !== row.secondaryScenarios.length || row.secondaryScenarios.includes(row.primaryScenario)) return false;
    if (row.intent !== undefined && row.intent !== null && (typeof row.intent !== 'string' || row.intent.length > 500)) return false;
    return ['brandReferences', 'audience', 'usageContext', 'requirements', 'constraints'].every(field => {
      const spans = row[field];
      if (spans === undefined && !['brandReferences', 'requirements'].includes(field)) return true;
      return Array.isArray(spans) && spans.length <= (['requirements', 'constraints'].includes(field) ? 30 : 20) && spans.every(span => span && typeof span === 'object' && !Array.isArray(span) && Object.keys(span).every(key => ['quote', 'start', 'end'].includes(key)) && typeof span.quote === 'string' && span.quote.length > 0 && span.quote.length <= 2000 && Number.isSafeInteger(span.start) && Number.isSafeInteger(span.end) && span.start >= 0 && span.end > span.start);
    });
  });
}
