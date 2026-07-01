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

try {
  const out = execFileSync('node', ['scripts/agent/next-task.mjs', '--context'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.stdout.write(out.trimEnd());
  process.stdout.write('\n');
  process.exit(0);
} catch {
  emitEmpty();
}
