#!/usr/bin/env node
/**
 * Ensure Agent Console (web UI) is running. Idempotent.
 *
 * Usage:
 *   node scripts/agent/ensure-gui.mjs          # wait until ready
 *   node scripts/agent/ensure-gui.mjs --hook   # Cursor sessionStart hook (spawn + short verify)
 */
import { spawn } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loopDir } from './lib/paths.mjs';

const DEFAULT_PORT = 9477;
const hookMode = process.argv.includes('--hook');

function repoRoot() {
  return process.env.CURSOR_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function getPort() {
  return Number(process.env.AGENT_GUI_PORT) || DEFAULT_PORT;
}

function serverScript(root) {
  return join(root, 'tools', 'agent-gui', 'server.mjs');
}

function pidPath(root) {
  return join(loopDir(), 'gui.pid');
}

function spawnLockPath(root) {
  return join(loopDir(), 'gui.spawn.lock');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isGuiRunning(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/state`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readStoredPid() {
  try {
    const pid = Number(readFileSync(pidPath(), 'utf8').trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function clearStoredPid() {
  try {
    unlinkSync(pidPath());
  } catch {
    /* ignore */
  }
}

function acquireSpawnLock(maxAgeMs = 15_000) {
  const lock = spawnLockPath();
  mkdirSync(loopDir(), { recursive: true });
  if (existsSync(lock)) {
    try {
      const age = Date.now() - Number(readFileSync(lock, 'utf8').trim());
      if (Number.isFinite(age) && age < maxAgeMs) return false;
    } catch {
      /* stale lock */
    }
    try {
      unlinkSync(lock);
    } catch {
      /* ignore */
    }
  }
  try {
    writeFileSync(lock, String(Date.now()), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

function releaseSpawnLock() {
  try {
    unlinkSync(spawnLockPath());
  } catch {
    /* ignore */
  }
}

async function stopStaleGui(storedPid, port) {
  if (!storedPid || !isProcessAlive(storedPid)) {
    clearStoredPid();
    return;
  }
  if (await isGuiRunning(port)) return;

  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/T', '/PID', String(storedPid)], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      process.kill(storedPid, 'SIGTERM');
    }
  } catch {
    /* ignore */
  }
  clearStoredPid();
  await sleep(400);
}

function spawnGui(root) {
  const script = serverScript(root);
  const child = spawn('node', [script], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, AGENT_GUI_NO_OPEN: hookMode ? '1' : process.env.AGENT_GUI_NO_OPEN ?? '1' },
  });
  child.unref();

  mkdirSync(loopDir(), { recursive: true });
  writeFileSync(pidPath(), String(child.pid), 'utf8');
  return child.pid;
}

/**
 * @param {{ root?: string; hook?: boolean; requireAutostart?: boolean }} [options]
 */
export async function ensureGui(options = {}) {
  const root = options.root ?? repoRoot();
  process.chdir(root);

  const port = getPort();
  const script = serverScript(root);
  const hook = options.hook ?? hookMode;

  if (!existsSync(script)) {
    return { ok: true, started: false, reason: 'gui-not-installed' };
  }

  if (options.requireAutostart !== false) {
    const autostartPath = join(loopDir(), 'autostart');
    if (!existsSync(autostartPath)) {
      return { ok: true, started: false, reason: 'autostart-disabled' };
    }
  }

  if (await isGuiRunning(port)) {
    return { ok: true, started: false, reason: 'already-running', port };
  }

  const storedPid = readStoredPid();
  await stopStaleGui(storedPid, port);

  if (await isGuiRunning(port)) {
    return { ok: true, started: false, reason: 'already-running', port };
  }

  if (!acquireSpawnLock()) {
    for (let i = 0; i < 6; i++) {
      await sleep(500);
      if (await isGuiRunning(port)) {
        return { ok: true, started: false, reason: 'already-running', port };
      }
    }
    return { ok: false, started: false, reason: 'spawn-lock-busy', port };
  }

  let pid;
  try {
    pid = spawnGui(root);
  } finally {
    releaseSpawnLock();
  }

  const attempts = hook ? 8 : 20;
  for (let i = 0; i < attempts; i++) {
    await sleep(500);
    if (await isGuiRunning(port)) {
      return { ok: true, started: true, reason: hook ? 'ready' : 'ready', port, pid };
    }
  }

  return { ok: hook, started: true, reason: hook ? 'spawned' : 'start-timeout', port, pid };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  ensureGui()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exit(result.ok ? 0 : 1);
    })
    .catch((err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
