#!/usr/bin/env node
/**
 * Ensure Agent Console (web UI) is running. Idempotent.
 *
 * Usage:
 *   node scripts/agent/ensure-gui.mjs          # wait until ready
 *   node scripts/agent/ensure-gui.mjs --hook   # fire-and-forget (Cursor hook)
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  return join(root, '.agent-loop', 'gui.pid');
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

function readStoredPid(root) {
  try {
    const pid = Number(readFileSync(pidPath(root), 'utf8').trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function spawnGui(root) {
  const script = serverScript(root);
  const child = spawn('node', [script], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, AGENT_GUI_NO_OPEN: '1' },
  });
  child.unref();

  mkdirSync(join(root, '.agent-loop'), { recursive: true });
  writeFileSync(pidPath(root), String(child.pid), 'utf8');
  return child.pid;
}

export async function ensureGui(options = {}) {
  const root = options.root ?? repoRoot();
  const port = getPort();
  const script = serverScript(root);

  if (!existsSync(script)) {
    return { ok: true, started: false, reason: 'gui-not-installed' };
  }

  if (await isGuiRunning(port)) {
    return { ok: true, started: false, reason: 'already-running', port };
  }

  const storedPid = readStoredPid(root);
  if (storedPid && isProcessAlive(storedPid) && (await isGuiRunning(port))) {
    return { ok: true, started: false, reason: 'already-running', port, pid: storedPid };
  }

  const pid = spawnGui(root);

  if (hookMode || options.hook) {
    return { ok: true, started: true, reason: 'spawned', port, pid };
  }

  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (await isGuiRunning(port)) {
      return { ok: true, started: true, reason: 'ready', port, pid };
    }
  }

  return { ok: false, started: true, reason: 'start-timeout', port, pid };
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
