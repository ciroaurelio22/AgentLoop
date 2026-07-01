#!/usr/bin/env node
import { detectPackageManager } from './lib/package-manager.mjs';

const root = process.argv.includes('--root')
  ? process.argv[process.argv.indexOf('--root') + 1]
  : process.cwd();

const detected = detectPackageManager(root);
console.log(JSON.stringify({ packageManager: detected, configValue: 'auto' }, null, 2));
