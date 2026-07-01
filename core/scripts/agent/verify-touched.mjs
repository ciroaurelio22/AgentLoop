#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const runTests = !process.argv.includes('--no-test');
const CONFIG_PATH = join(ROOT, 'agent-loop.config.json');

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return { verify: { packageManager: 'pnpm', mode: 'root' } };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { verify: { packageManager: 'pnpm', mode: 'root' } };
  }
}

function gitLines(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function branchCommittedFiles(cfg) {
  const base = cfg.verify?.baseBranch ?? 'main';
  const mergeBase =
    gitLines(`merge-base HEAD origin/${base}`)[0] ??
    gitLines('merge-base HEAD origin/main')[0] ??
    gitLines('rev-parse HEAD~1')[0];

  if (mergeBase) {
    return gitLines(`diff --name-only ${mergeBase}..HEAD`);
  }
  return gitLines('show --name-only --pretty=format: HEAD');
}

function touchedFiles(cfg) {
  return [
    ...new Set([
      ...gitLines('diff --name-only HEAD'),
      ...gitLines('diff --name-only --cached'),
      ...gitLines('ls-files --others --exclude-standard'),
      ...branchCommittedFiles(cfg),
    ]),
  ];
}

function touchedPackages(files, cfg) {
  const mapping = cfg.verify?.packages;
  if (mapping && typeof mapping === 'object') {
    const packages = new Set();
    for (const file of files) {
      for (const [prefix, pkg] of Object.entries(mapping)) {
        if (file.startsWith(prefix)) packages.add(pkg);
      }
    }
    return [...packages];
  }

  if (files.length === 0) return [];
  return ['.'];
}

function pm(cfg) {
  return cfg.verify?.packageManager ?? 'pnpm';
}

function run(cmd) {
  try {
    execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    return null;
  } catch (error) {
    const stdout = error.stdout?.toString() ?? '';
    const stderr = error.stderr?.toString() ?? '';
    return (stdout + stderr).trim().slice(0, 4000);
  }
}

const cfg = loadConfig();
const files = touchedFiles(cfg);
const packages = touchedPackages(files, cfg);

if (packages.length === 0) {
  console.log(JSON.stringify({ ok: true, packages: [], message: 'No modified files detected' }));
  process.exit(0);
}

const failures = [];
const steps = runTests ? ['lint', 'typecheck', 'test'] : ['lint', 'typecheck'];
const manager = pm(cfg);

for (const pkg of packages) {
  for (const step of steps) {
    const cmd =
      pkg === '.'
        ? `${manager} run ${step}`
        : `${manager} --filter ${pkg} run ${step}`;
    const err = run(cmd);
    if (err) failures.push({ step, package: pkg, output: err });
  }
}

if (failures.length) {
  console.log(JSON.stringify({ ok: false, packages, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, packages, steps }));
