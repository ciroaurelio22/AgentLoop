import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function repoRoot() {
  return process.env.CURSOR_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

export function resolveLoopDir(root = repoRoot()) {
  if (process.env.AGENT_LOOP_DIR) {
    return join(resolve(root), process.env.AGENT_LOOP_DIR);
  }
  const agentLoop = join(resolve(root), '.agent-loop');
  if (existsSync(agentLoop)) return agentLoop;
  return join(resolve(root), '.cursor', 'agent-loop');
}

/** @param {string} [root] @param {...string} parts */
export function resolveAgentScript(root, ...parts) {
  const base = resolve(root ?? repoRoot());
  const installed = join(base, 'scripts', 'agent', ...parts);
  if (existsSync(installed)) return installed;
  const kit = join(base, 'core', 'scripts', 'agent', ...parts);
  if (existsSync(kit)) return kit;
  return installed;
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
