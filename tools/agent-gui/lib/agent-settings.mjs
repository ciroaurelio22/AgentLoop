import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loopDir } from './repo-utils.mjs';

/** @typedef {'cursor' | 'claude'} AgentBackend */

export const DEFAULT_MODEL = {
  cursor: 'composer-2.5-fast',
  claude: 'claude-sonnet-4-6',
};

export const MODEL_PRESETS = {
  cursor: [
    'composer-2.5-fast',
    'claude-4.6-sonnet-medium-thinking',
    'claude-opus-4-8-thinking-high',
    'claude-sonnet-5-thinking-high',
    'gpt-5.3-codex',
    'gpt-5.5-medium',
  ],
  claude: [
    'claude-sonnet-4-6',
    'claude-opus-4-8',
    'claude-sonnet-5-thinking-high',
    'claude-opus-4-8-thinking-high',
  ],
};

/** @param {string | null | undefined} repoRoot */
export function resolveAgentBackend(repoRoot) {
  const fromEnv = (process.env.AGENT_BACKEND ?? 'cursor').toLowerCase();
  if (repoRoot) {
    const backendPath = join(loopDir(resolve(repoRoot)), 'backend');
    if (existsSync(backendPath)) {
      try {
        const line = readFileSync(backendPath, 'utf8').trim().toLowerCase();
        if (line === 'claude' || line === 'cursor') return /** @type {AgentBackend} */ (line);
      } catch {
        /* ignore */
      }
    }
  }
  return fromEnv === 'claude' ? 'claude' : 'cursor';
}

/** @param {string | null | undefined} repoRoot @param {AgentBackend} [backend] */
export function resolveAgentModel(repoRoot, backend) {
  const b = backend ?? resolveAgentBackend(repoRoot);
  if (repoRoot) {
    const modelPath = join(loopDir(resolve(repoRoot)), 'model');
    if (existsSync(modelPath)) {
      try {
        const line = readFileSync(modelPath, 'utf8').trim();
        if (line) return line;
      } catch {
        /* ignore */
      }
    }
  }
  const fromEnv = process.env.AGENT_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_MODEL[b];
}

/** @param {string | null | undefined} repoRoot */
export function readAgentSettings(repoRoot) {
  const backend = resolveAgentBackend(repoRoot);
  return {
    backend,
    model: resolveAgentModel(repoRoot, backend),
    presets: MODEL_PRESETS[backend],
    defaults: DEFAULT_MODEL,
  };
}

/**
 * @param {string} repoRoot
 * @param {{ backend?: string; model?: string; resetModelOnBackendChange?: boolean }} patch
 */
export function writeAgentSettings(repoRoot, patch) {
  const root = resolve(repoRoot);
  const dir = loopDir(root);
  mkdirSync(dir, { recursive: true });

  let backend = resolveAgentBackend(root);

  if (patch.backend !== undefined) {
    backend = patch.backend === 'claude' ? 'claude' : 'cursor';
    writeFileSync(join(dir, 'backend'), `${backend}\n`, 'utf8');
    if (patch.resetModelOnBackendChange) {
      writeFileSync(join(dir, 'model'), `${DEFAULT_MODEL[backend]}\n`, 'utf8');
    }
  }

  if (patch.model !== undefined) {
    const model = String(patch.model).trim();
    const modelPath = join(dir, 'model');
    if (model) {
      writeFileSync(modelPath, `${model}\n`, 'utf8');
    } else {
      try {
        unlinkSync(modelPath);
      } catch {
        /* ignore */
      }
    }
  }

  return readAgentSettings(root);
}
