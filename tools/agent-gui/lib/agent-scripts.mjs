import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
/** Repo root where this GUI copy lives (parent of `tools/`) */
const GUI_REPO_ROOT = join(LIB_DIR, '..', '..', '..');

function scriptsRootForRepo(repoRoot) {
  const root = resolve(repoRoot ?? GUI_REPO_ROOT);
  const installed = join(root, 'scripts', 'agent');
  if (existsSync(join(installed, 'init-task.mjs'))) return installed;
  const kit = join(root, 'core', 'scripts', 'agent');
  if (existsSync(join(kit, 'init-task.mjs'))) return kit;
  return installed;
}

/** Agent scripts root next to this GUI install. */
export function agentScriptsRoot() {
  return scriptsRootForRepo(GUI_REPO_ROOT);
}

/** @param {...string} parts */
export function resolveAgentScript(...parts) {
  return join(agentScriptsRoot(), ...parts);
}

/** @param {string} repoRoot @param {...string} parts */
export function resolveAgentScriptForRepo(repoRoot, ...parts) {
  return join(scriptsRootForRepo(repoRoot), ...parts);
}

async function importAgentModule(...parts) {
  const path = resolveAgentScript(...parts);
  if (!existsSync(path)) {
    throw new Error(
      `Agent script not found: ${path} (expected scripts/agent or core/scripts/agent under ${GUI_REPO_ROOT})`,
    );
  }
  return import(pathToFileURL(path).href);
}

const pmMod = await importAgentModule('lib', 'package-manager.mjs');
const templateMod = await importAgentModule('lib', 'template-fill.mjs');

export const detectPackageManager = pmMod.detectPackageManager;
export const fillProgramTemplate = templateMod.fillProgramTemplate;
