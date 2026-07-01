/**
 * Static model catalogs for Agent Loop GUI and run-agent.
 *
 * Sources (verify when updating):
 * - Cursor: https://cursor.com/docs/cli/reference/parameters (--model)
 * - Claude: https://code.claude.com/docs/en/model-config
 * - Codex:  https://developers.openai.com/codex/models
 */

/** @typedef {'cursor' | 'claude' | 'codex'} AgentBackend */

export const MODEL_CATALOG_DOCS = {
  cursor: 'https://cursor.com/docs/cli/reference/parameters',
  claude: 'https://code.claude.com/docs/en/model-config',
  codex: 'https://developers.openai.com/codex/models',
};

export const DEFAULT_MODEL = {
  cursor: 'composer-2.5-fast',
  claude: 'sonnet',
  codex: 'gpt-5.5',
};

/** @type {Record<AgentBackend, { id: string; label: string }[]>} */
export const MODEL_CATALOG = {
  cursor: [
    { id: 'composer-2.5-fast', label: 'Composer 2.5 Fast (recommended)' },
    { id: 'composer-2.5', label: 'Composer 2.5' },
    { id: 'auto', label: 'Auto' },
    { id: 'gpt-5.5-medium', label: 'GPT-5.5 Medium' },
    { id: 'gpt-5.5-high', label: 'GPT-5.5 High' },
    { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
    { id: 'gpt-5.3-codex-fast', label: 'GPT-5.3 Codex Fast' },
    { id: 'gpt-5.3-codex-high', label: 'GPT-5.3 Codex High' },
    { id: 'claude-4.6-sonnet-medium-thinking', label: 'Sonnet 4.6 Thinking' },
    { id: 'claude-opus-4-8-thinking-high', label: 'Opus 4.8 Thinking' },
    { id: 'claude-sonnet-5-thinking-high', label: 'Sonnet 5 Thinking' },
  ],
  claude: [
    { id: 'sonnet', label: 'Sonnet (alias → latest Sonnet)' },
    { id: 'opus', label: 'Opus (alias → latest Opus)' },
    { id: 'haiku', label: 'Haiku (alias → fast tasks)' },
    { id: 'fable', label: 'Fable (alias → Fable 5)' },
    { id: 'best', label: 'Best (Fable 5 or latest Opus)' },
    { id: 'sonnet[1m]', label: 'Sonnet 1M context' },
    { id: 'opus[1m]', label: 'Opus 1M context' },
    { id: 'opusplan', label: 'Opus plan → Sonnet execute' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
    { id: 'claude-opus-4-8', label: 'Opus 4.8' },
    { id: 'claude-fable-5', label: 'Fable 5' },
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  ],
  codex: [
    { id: 'gpt-5.5', label: 'GPT-5.5 (recommended)' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini (fast / subagents)' },
    { id: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark (Pro preview)' },
  ],
};

/** @param {string} backend */
export function normalizeAgentBackend(backend) {
  const value = String(backend ?? 'cursor').trim().toLowerCase();
  if (value === 'claude' || value === 'codex' || value === 'cursor') return /** @type {AgentBackend} */ (value);
  return 'cursor';
}

/** @param {AgentBackend} backend */
export function listCatalogModels(backend) {
  const key = normalizeAgentBackend(backend);
  return {
    models: MODEL_CATALOG[key] ?? [],
    source: 'catalog',
    docs: MODEL_CATALOG_DOCS[key],
  };
}

/** @param {AgentBackend} backend */
export function defaultModelForBackend(backend) {
  return DEFAULT_MODEL[normalizeAgentBackend(backend)];
}
