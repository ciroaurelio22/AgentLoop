#!/usr/bin/env node
/**
 * sessionStart: ensure Agent Console web UI is running; start it if not.
 * Requires `.agent-loop/autostart` and `tools/agent-gui/server.mjs`.
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { emitEmpty, readHookInput, repoRoot, resolveLoopDir } from './lib/hook-io.mjs';

const input = readHookInput();
const root = repoRoot();
process.chdir(root);

if ((input.composer_mode ?? '') === 'ask') {
  emitEmpty();
}

if (process.env.AGENT_LOOP === '1') {
  emitEmpty();
}

if (!existsSync(join(root, 'tools', 'agent-gui', 'server.mjs'))) {
  emitEmpty();
}

if (!existsSync(join(resolveLoopDir(root), 'autostart'))) {
  emitEmpty();
}

try {
  execFileSync('node', ['scripts/agent/ensure-gui.mjs', '--hook'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
  });
} catch {
  // Non-blocking: agent session continues even if GUI fails to start.
}

emitEmpty();
