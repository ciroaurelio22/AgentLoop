#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { emitEmpty, readHookInput, repoRoot, resolveLoopDir } from './lib/hook-io.mjs';
import { checkForUpdate } from '../../scripts/agent/lib/update-check.mjs';

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
  const result = await checkForUpdate({ root, hook: true });
  if (result.updateAvailable && result.notice) {
    process.stdout.write(`${result.notice}\n\n`);
  }
  process.exit(0);
} catch {
  emitEmpty();
}
