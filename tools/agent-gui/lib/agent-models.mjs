import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveAgentBackend } from './agent-settings.mjs';
import { resolveAgentScriptForRepo } from './agent-scripts.mjs';

/** @type {Map<string, { at: number; data: object }>} */
const cache = new Map();

const CACHE_MS = 120_000;

/**
 * @param {string} repoRoot
 * @param {{ refresh?: boolean; backend?: 'cursor' | 'claude' }} [options]
 */
export async function fetchAgentModels(repoRoot, options = {}) {
  const root = resolve(repoRoot);
  const backend = options.backend ?? resolveAgentBackend(root);
  const key = `${root}:${backend}`;
  const cached = cache.get(key);
  if (!options.refresh && cached && Date.now() - cached.at < CACHE_MS) {
    return cached.data;
  }

  const scriptPath = resolveAgentScriptForRepo(root, 'lib', 'agent-cli.mjs');
  if (!existsSync(scriptPath)) {
    const data = {
      backend,
      models: [],
      source: 'cli',
      error: 'Agent scripts not found in this workspace.',
    };
    cache.set(key, { at: Date.now(), data });
    return data;
  }

  const mod = await import(pathToFileURL(scriptPath).href);
  const listed = await mod.listAgentModels(backend, root);
  const data = { backend, ...listed };
  cache.set(key, { at: Date.now(), data });
  return data;
}

/** @param {string} repoRoot @param {'cursor' | 'claude'} [backend] */
export function invalidateAgentModelsCache(repoRoot, backend) {
  const root = resolve(repoRoot);
  if (backend) {
    cache.delete(`${root}:${backend}`);
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${root}:`)) cache.delete(key);
  }
}
