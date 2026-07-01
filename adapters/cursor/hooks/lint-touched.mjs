#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { emitEmpty, readHookInput, repoRoot } from './lib/hook-io.mjs';

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

try {
  execFileSync('pnpm', ['exec', 'eslint', target, '--fix', '--quiet'], {
    cwd: root,
    stdio: 'ignore',
  });
} catch {
  // eslint errors are non-blocking for the hook
}

emitEmpty();
