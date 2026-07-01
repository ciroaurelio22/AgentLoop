import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function repoRoot() {
  return process.env.CURSOR_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

export function resolveLoopDir(root = repoRoot()) {
  if (process.env.AGENT_LOOP_DIR) {
    return join(root, process.env.AGENT_LOOP_DIR);
  }
  const agentLoop = join(root, '.agent-loop');
  if (existsSync(agentLoop)) return agentLoop;
  return join(root, '.cursor', 'agent-loop');
}

export function readHookInput() {
  const raw = readFileSync(0, 'utf8');
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function emitJson(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exit(exitCode);
}

export function emitEmpty() {
  emitJson({});
}
