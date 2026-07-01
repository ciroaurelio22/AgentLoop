import { resolveAgentBackend } from './agent-settings.mjs';
import { resolveAgentScriptForRepo } from './agent-scripts.mjs';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @param {string} repoRoot
 * @param {{ backend?: 'cursor' | 'claude' | 'codex' }} [options]
 */
export async function fetchAgentModels(repoRoot, options = {}) {
  const root = resolve(repoRoot);
  const backend = options.backend ?? resolveAgentBackend(root);
  const scriptPath = resolveAgentScriptForRepo(root, 'lib', 'agent-model-catalog.mjs');

  if (!existsSync(scriptPath)) {
    return {
      backend,
      models: [],
      source: 'catalog',
      error: 'Agent scripts not found in this workspace.',
    };
  }

  const mod = await import(pathToFileURL(scriptPath).href);
  return { backend, ...mod.listCatalogModels(backend) };
}

/** @param {string} repoRoot */
export function invalidateAgentModelsCache(_repoRoot) {
  /* static catalog — no cache */
}
