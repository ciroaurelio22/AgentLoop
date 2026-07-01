#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { emitEmpty, readHookInput, repoRoot } from './lib/hook-io.mjs';
import { execCommand, resolvePackageManager } from '../../scripts/agent/lib/package-manager.mjs';

const input = readHookInput();
const file = input.file_path ?? input.path ?? '';

if (!file || !/\.(ts|tsx|js|jsx)$/i.test(file)) {
  emitEmpty();
}

const root = repoRoot();
process.chdir(root);

let target = '';
if (existsSync(join(root, 'apps/web', file))) {
  target = join('apps/web', file);
} else if (existsSync(join(root, 'apps/api', file))) {
  target = join('apps/api', file);
} else if (existsSync(join(root, file))) {
  target = file;
} else {
  emitEmpty();
}

let cfg = { verify: { packageManager: 'auto' } };
const cfgPath = join(root, 'agent-loop.config.json');
if (existsSync(cfgPath)) {
  try {
    cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  } catch {
    /* ignore */
  }
}

const manager = resolvePackageManager(cfg, root);
const eslintArgs = execCommand(manager, ['eslint', target, '--fix', '--quiet']);

try {
  execFileSync(eslintArgs[0], eslintArgs.slice(1), {
    cwd: root,
    stdio: 'ignore',
  });
} catch {
  // eslint errors are non-blocking for the hook
}

emitEmpty();
