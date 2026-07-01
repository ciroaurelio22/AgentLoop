#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const result = spawnSync('node', ['scripts/agent/update-task.mjs', 'done', ...args], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
