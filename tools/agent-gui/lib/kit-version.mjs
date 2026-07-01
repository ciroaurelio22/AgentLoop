import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loopDir } from './repo-utils.mjs';

const GUI_REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * @param {string | null | undefined} repoRoot
 * @returns {string | null}
 */
export function readKitVersion(repoRoot) {
  if (repoRoot) {
    const installed = join(loopDir(repoRoot), 'kit-version');
    if (existsSync(installed)) {
      const v = readFileSync(installed, 'utf8').trim();
      if (v) return v;
    }
  }

  const fallbacks = [join(GUI_REPO_ROOT, 'VERSION'), join(process.cwd(), 'VERSION')];
  for (const path of fallbacks) {
    if (!existsSync(path)) continue;
    const v = readFileSync(path, 'utf8').trim();
    if (v) return v;
  }

  return null;
}
