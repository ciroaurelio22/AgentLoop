#!/usr/bin/env node
/**
 * Update agent-loop in a target repository from the GitHub kit.
 *
 * Usage:
 *   node scripts/agent/update.mjs [--target /path/to/repo] [--branch master]
 *   pnpm agent:update
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = 'https://github.com/ciroaurelio22/AgentLoop.git';
const DEFAULT_BRANCH = 'master';

function parseArgs(argv) {
  const out = {
    target: process.cwd(),
    branch: DEFAULT_BRANCH,
    kitDir: join(tmpdir(), 'agent-loop-kit'),
    fromLocal: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target' && argv[i + 1]) out.target = resolve(argv[++i]);
    else if (a === '--branch' && argv[i + 1]) out.branch = argv[++i];
    else if (a === '--kit-dir' && argv[i + 1]) out.kitDir = resolve(argv[++i]);
    else if (a === '--local') out.fromLocal = true;
  }
  return out;
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    ...opts,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(127);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function localKitRoot() {
  const candidates = [
    resolve(__dirname, '../..'),
    resolve(__dirname, '../../..'),
    resolve(__dirname, '../../../..'),
  ];
  for (const root of candidates) {
    if (existsSync(join(root, 'bin', 'install.mjs'))) return root;
  }
  return null;
}

function ensureKitFromGitHub(kitDir, branch) {
  mkdirSync(dirname(kitDir), { recursive: true });
  if (existsSync(join(kitDir, '.git'))) {
    console.log(`Pulling latest AgentLoop → ${kitDir} (${branch})`);
    run('git', ['-C', kitDir, 'fetch', 'origin', branch]);
    run('git', ['-C', kitDir, 'checkout', branch]);
    run('git', ['-C', kitDir, 'pull', '--ff-only', 'origin', branch]);
    return kitDir;
  }
  console.log(`Cloning AgentLoop from GitHub → ${kitDir} (${branch})`);
  run('git', ['clone', '--branch', branch, '--depth', '1', DEFAULT_REPO, kitDir]);
  return kitDir;
}

function resolveKitRoot(opts) {
  if (opts.fromLocal) {
    const local = localKitRoot();
    if (!local) {
      console.error('Local kit not found. Run without --local to fetch from GitHub.');
      process.exit(1);
    }
    return local;
  }
  return ensureKitFromGitHub(opts.kitDir, opts.branch);
}

const opts = parseArgs(process.argv.slice(2));
const kitRoot = resolveKitRoot(opts);

const source = opts.fromLocal ? kitRoot : `GitHub (${opts.branch})`;
console.log(`Updating agent-loop in ${opts.target} from ${source}`);
run('node', [join(kitRoot, 'bin', 'install.mjs'), '--target', opts.target, '--all', '--force']);
console.log('\nUpdate complete.');
