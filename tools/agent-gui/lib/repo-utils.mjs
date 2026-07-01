import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const CONFIG_PATH = join(homedir(), '.agent-loop', 'agent-gui.json');
export const TASK_ID_RE = /^TASK-(\d+)$/i;
export const DEFAULT_PORT = 9477;

export function loopDir(root) {
  const abs = resolve(root);
  if (existsSync(join(abs, '.agent-loop'))) return join(abs, '.agent-loop');
  return join(abs, '.cursor', 'agent-loop');
}

export function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(data) {
  mkdirSync(join(homedir(), '.agent-loop'), { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function isValidRepo(path) {
  const root = resolve(path);
  const hasScripts =
    existsSync(join(root, 'scripts', 'agent', 'init-task.mjs')) ||
    existsSync(join(root, 'core', 'scripts', 'agent', 'init-task.mjs'));
  return (
    existsSync(loopDir(root)) &&
    existsSync(join(root, 'specs', 'agent-tasks')) &&
    hasScripts
  );
}

export function collectTaskNumbers(repoRoot) {
  const nums = [];
  const queuePath = join(loopDir(repoRoot), 'queue.json');
  if (existsSync(queuePath)) {
    try {
      const data = JSON.parse(readFileSync(queuePath, 'utf8'));
      for (const t of data.tasks ?? []) {
        const m = TASK_ID_RE.exec(String(t.id ?? '').trim());
        if (m) nums.push(Number(m[1]));
      }
    } catch {
      /* ignore */
    }
  }
  const tasksDir = join(repoRoot, 'specs', 'agent-tasks');
  if (existsSync(tasksDir)) {
    for (const name of readdirSync(tasksDir)) {
      const m = TASK_ID_RE.exec(name.replace(/\.md$/i, ''));
      if (m) nums.push(Number(m[1]));
    }
  }
  return nums;
}

export function nextTaskId(repoRoot) {
  const nums = collectTaskNumbers(repoRoot);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `TASK-${String(n).padStart(3, '0')}`;
}

export function resolveStartupRepo(fallback) {
  const config = loadConfig();
  const last = config.last_repo;
  if (last && isValidRepo(last)) return resolve(last);
  if (fallback && isValidRepo(fallback)) return resolve(fallback);
  return null;
}
