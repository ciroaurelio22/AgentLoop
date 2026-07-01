#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { emitEmpty, readHookInput, repoRoot, resolveLoopDir } from './lib/hook-io.mjs';

const input = readHookInput();
const root = repoRoot();
process.chdir(root);

const isBackground = input.is_background_agent === true;
const composerMode = input.composer_mode ?? '';

if (isBackground !== true && process.env.AGENT_LOOP !== '1') {
  if (!existsSync(join(resolveLoopDir(root), 'autostart'))) {
    emitEmpty();
  }
}

if (composerMode === 'ask') {
  emitEmpty();
}

if (!existsSync(join(root, 'tools', 'agent-gui', 'server.mjs'))) {
  emitEmpty();
}

try {
  execFileSync('node', ['scripts/agent/ensure-gui.mjs', '--hook'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 8000,
  });
} catch {
  // non-blocking — agent session can continue without GUI
}

emitEmpty();
