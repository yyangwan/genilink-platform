export interface AiPlatformMeta {
  key: string;
  label: string;
  glyph: string;
  iconPath?: string;
  color: string;
  background: string;
}

const PLATFORM_META: Record<string, AiPlatformMeta> = {
  deepseek: { key: "deepseek", label: "DeepSeek", glyph: "D", iconPath: "/platform-icons/deepseek.ico", color: "#4d6bfe", background: "#4d6bfe18" },
  qwen: { key: "qwen", label: "通义千问", glyph: "千", iconPath: "/platform-icons/qwen.png", color: "#615ced", background: "#615ced18" },
  doubao: { key: "doubao", label: "豆包", glyph: "豆", iconPath: "/platform-icons/doubao.png", color: "#2f6bff", background: "#2f6bff18" },
  kimi: { key: "kimi", label: "Kimi", glyph: "K", iconPath: "/platform-icons/kimi.ico", color: "#94a3b8", background: "#64748b18" },
  yuanbao: { key: "yuanbao", label: "腾讯元宝", glyph: "元", iconPath: "/platform-icons/yuanbao.png", color: "#00a870", background: "#00a87018" },
  chatgpt: { key: "chatgpt", label: "ChatGPT", glyph: "G", color: "#10a37f", background: "#10a37f18" },
  gemini: { key: "gemini", label: "Gemini", glyph: "G", color: "#4285f4", background: "#4285f418" },
  claude: { key: "claude", label: "Claude", glyph: "C", color: "#d97757", background: "#d9775718" },
  perplexity: { key: "perplexity", label: "Perplexity", glyph: "P", color: "#20b8cd", background: "#20b8cd18" },
  ernie: { key: "ernie", label: "文心一言", glyph: "文", color: "#2468f2", background: "#2468f218" },
  zhipu: { key: "zhipu", label: "智谱清言", glyph: "智", color: "#3854e8", background: "#3854e818" },
};

const PLATFORM_ALIASES: Record<string, keyof typeof PLATFORM_META> = {
  deepseek: "deepseek",
  "deep seek": "deepseek",
  qwen: "qwen",
  tongyi: "qwen",
  "tongyi qianwen": "qwen",
  通义: "qwen",
  通义千问: "qwen",
  doubao: "doubao",
  豆包: "doubao",
  kimi: "kimi",
  moonshot: "kimi",
  月之暗面: "kimi",
  hunyuan: "yuanbao",
  yuanbao: "yuanbao",
  元宝: "yuanbao",
  腾讯元宝: "yuanbao",
  腾讯混元: "yuanbao",
  "tencent yuanbao": "yuanbao",
  "tencent hunyuan": "yuanbao",
  chatgpt: "chatgpt",
  "chat gpt": "chatgpt",
  openai: "chatgpt",
  gpt: "chatgpt",
  gemini: "gemini",
  "google gemini": "gemini",
  claude: "claude",
  anthropic: "claude",
  perplexity: "perplexity",
  ernie: "ernie",
  wenxin: "ernie",
  文心一言: "ernie",
  zhipu: "zhipu",
  chatglm: "zhipu",
  智谱清言: "zhipu",
};

function normalizePlatform(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function getAiPlatformMeta(platform: string): AiPlatformMeta {
  const original = platform.trim();
  const normalized = normalizePlatform(original);
  const key = PLATFORM_ALIASES[normalized];
  if (key) return PLATFORM_META[key];

  return {
    key: normalized || "unknown",
    label: original || "未知平台",
    glyph: original ? original.slice(0, 1).toLocaleUpperCase() : "AI",
    color: "var(--text-muted)",
    background: "var(--bg-hover)",
  };
}

export function getAiPlatformLabel(platform: string): string {
  return getAiPlatformMeta(platform).label;
}
