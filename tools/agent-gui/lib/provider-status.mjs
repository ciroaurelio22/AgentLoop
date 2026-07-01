import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AGENT_BACKENDS } from './agent-settings.mjs';
import { resolveAgentScriptForRepo } from './agent-scripts.mjs';

/** @type {import('../../../core/scripts/agent/lib/agent-cli.mjs') | null} */
let cliMod = null;

/** @param {string | null | undefined} repoRoot */
export async function warmProviderStatus(repoRoot) {
  const root = resolve(repoRoot ?? process.cwd());
  const scriptPath = resolveAgentScriptForRepo(root, 'lib', 'agent-cli.mjs');
  if (!existsSync(scriptPath)) {
    cliMod = null;
    return;
  }
  cliMod = await import(pathToFileURL(scriptPath).href);
}

/** @returns {{ id: string; installed: boolean; binary: string }[]} */
export function getInstalledProviders() {
  if (cliMod?.listInstalledProvidersOnPath) {
    return cliMod.listInstalledProvidersOnPath();
  }
  return AGENT_BACKENDS.map((id) => ({
    id,
    installed: false,
    binary: id === 'claude' ? 'claude' : id === 'codex' ? 'codex' : 'agent',
  }));
}

/** @param {string} backend */
export function isProviderInstalledOnPath(backend) {
  return getInstalledProviders().some((p) => p.id === backend && p.installed);
}
