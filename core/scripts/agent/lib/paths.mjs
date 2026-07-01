import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

/** @returns {string} Absolute path to agent loop state directory */
export function loopDir() {
  if (process.env.AGENT_LOOP_DIR) {
    return join(ROOT, process.env.AGENT_LOOP_DIR);
  }
  if (existsSync(join(ROOT, '.agent-loop'))) {
    return join(ROOT, '.agent-loop');
  }
  if (existsSync(join(ROOT, '.cursor', 'agent-loop'))) {
    return join(ROOT, '.cursor', 'agent-loop');
  }
  return join(ROOT, '.agent-loop');
}

export function repoRoot() {
  return process.env.CURSOR_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || ROOT;
}
