type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compactStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function safeVariableName(value: string, index: number): string {
  const cleaned = value
    .trim()
    .replace(/^\{\{|\}\}$/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || `var_${index + 1}`;
}

export function normalizeBrandVoice(value: unknown) {
  const voice = asObject(value);
  const samples = parseJsonArray(voice.samples);
  const sampleContent = typeof voice.sampleContent === 'string'
    ? voice.sampleContent
    : typeof samples[0] === 'string'
      ? samples[0]
      : undefined;
  const toneKeywords = compactStrings(voice.toneKeywords);
  const guidelines = typeof voice.guidelines === 'string' ? voice.guidelines : '';

  return {
    ...voice,
    sampleContent,
    toneKeywords: toneKeywords.length > 0
      ? toneKeywords
      : guidelines.split(',').map((item) => item.trim()).filter(Boolean),
  };
}

export function normalizeBrandVoices(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeBrandVoice) : [];
}

export function toUpstreamBrandVoicePayload(payload: JsonObject) {
  const toneKeywords = compactStrings(payload.toneKeywords);
  const sampleContent = typeof payload.sampleContent === 'string' ? payload.sampleContent.trim() : '';
  return {
    ...payload,
    guidelines: typeof payload.guidelines === 'string'
      ? payload.guidelines
      : toneKeywords.join(', '),
    samples: Array.isArray(payload.samples)
      ? payload.samples
      : [sampleContent],
  };
}

export function normalizeTemplate(value: unknown) {
  const template = asObject(value);
  const variables = parseJsonArray(template.variables);
  return {
    ...template,
    content: typeof template.content === 'string' ? template.content : template.template,
    variables: variables.map((item) => {
      if (typeof item === 'string') return item;
      const variable = asObject(item);
      return typeof variable.name === 'string' ? variable.name : '';
    }).filter(Boolean),
  };
}

export function normalizeTemplates(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeTemplate) : [];
}

export function toUpstreamTemplatePayload(payload: JsonObject) {
  const variables = compactStrings(payload.variables).map((name, index) => ({
    name: safeVariableName(name, index),
    type: 'text',
    description: name,
    required: false,
  }));
  return {
    ...payload,
    template: typeof payload.template === 'string' ? payload.template : payload.content,
    variables,
  };
}

export function unwrapGenieSources(value: unknown) {
  const body = asObject(value);
  return Array.isArray(value)
    ? value
    : Array.isArray(body.sources)
      ? body.sources
      : [];
}

export function unwrapGenieSourceCreate(value: unknown) {
  const body = asObject(value);
  return body.source ?? value;
}

export function unwrapGenieGenerations(value: unknown) {
  const body = asObject(value);
  return Array.isArray(value)
    ? value
    : Array.isArray(body.drafts)
      ? body.drafts.map((draft) => ({ ...asObject(draft), status: asObject(draft).status ?? 'completed' }))
      : [];
}

export function normalizeGenieGenerationResult(value: unknown) {
  const body = asObject(value);
  return {
    ...body,
    content: body.content ?? (typeof body.ideas === 'number' ? `${body.ideas} ideas generated` : undefined),
    result: body.result ?? (typeof body.ideas === 'number' ? `${body.ideas} ideas generated` : undefined),
  };
}

export function normalizePlatformConfig(value: unknown, platform: string) {
  const body = asObject(value);
  const config = asObject(body.config ?? body);
  const connected = Boolean(config.enabled && (config.hasAccessToken || config.appId));
  return {
    ...config,
    platform: typeof config.platform === 'string' ? config.platform : platform,
    connected,
  };
}
