import { resolveAgentBackend } from './agent-settings.mjs';
import { resolveAgentScriptForRepo } from './agent-scripts.mjs';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** @type {import('../../../core/scripts/agent/lib/agent-model-catalog.mjs') | null} */
let catalogMod = null;

/** @param {string} repoRoot */
export async function warmCatalog(repoRoot) {
  const root = resolve(repoRoot);
  const scriptPath = resolveAgentScriptForRepo(root, 'lib', 'agent-model-catalog.mjs');
  if (!existsSync(scriptPath)) {
    catalogMod = null;
    return;
  }
  if (catalogMod) return;
  catalogMod = await import(pathToFileURL(scriptPath).href);
}

/**
 * @param {string} repoRoot
 * @param {{ backend?: 'cursor' | 'claude' | 'codex' }} [options]
 */
export async function fetchAgentModels(repoRoot, options = {}) {
  const root = resolve(repoRoot);
  const backend = options.backend ?? resolveAgentBackend(root);
  await warmCatalog(root);

  if (!catalogMod) {
    return {
      backend,
      models: [],
      source: 'catalog',
      error: 'Agent scripts not found in this workspace.',
    };
  }

  return { backend, ...catalogMod.listCatalogModels(backend) };
}

/** @param {string} repoRoot */
export function invalidateAgentModelsCache(_repoRoot) {
  catalogMod = null;
}
