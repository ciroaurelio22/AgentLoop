#!/usr/bin/env node
/**
 * Remove agent-loop from a target repository.
 *
 * Usage:
 *   node bin/uninstall.mjs --target /path/to/repo [--keep-data]
 */
import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AGENT_SCRIPT_KEYS = [
  'agent:status',
  'agent:init',
  'agent:register',
  'agent:next',
  'agent:verify',
  'agent:acceptance',
  'agent:done',
  'agent:gui',
  'agent:gui:ensure',
  'agent:update',
  'agent:check-update',
];

const HOOK_FILES = [
  'ensure-gui.mjs',
  'agent-update-check.mjs',
  'agent-session-start.mjs',
  'guard-shell.mjs',
  'redact-secrets.mjs',
  'lint-touched.mjs',
  'agent-stop-loop.mjs',
  'lib/hook-io.mjs',
];

const SKILL_DIRS = ['uninstall', 'update'];

function parseArgs(argv) {
  const out = { target: process.cwd(), keepData: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target' && argv[i + 1]) out.target = resolve(argv[++i]);
    else if (a === '--keep-data') out.keepData = true;
  }
  return out;
}

function removePath(path) {
  if (!existsSync(path)) return false;
  rmSync(path, { recursive: true, force: true });
  return true;
}

function stripPackageScripts(targetRoot) {
  const pkgPath = join(targetRoot, 'package.json');
  if (!existsSync(pkgPath)) return;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts) return;
  for (const key of AGENT_SCRIPT_KEYS) delete pkg.scripts[key];
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function stripSnippet(targetFile, marker) {
  if (!existsSync(targetFile)) return;
  const markerComment = `<!-- ${marker} -->`;
  const text = readFileSync(targetFile, 'utf8');
  const idx = text.indexOf(markerComment);
  if (idx < 0) return;
  writeFileSync(targetFile, `${text.slice(0, idx).trimEnd()}\n`);
}

function removeHookFiles(targetRoot) {
  const hooksDir = join(targetRoot, '.cursor', 'hooks');
  for (const rel of HOOK_FILES) {
    removePath(join(hooksDir, rel));
  }
  const libDir = join(hooksDir, 'lib');
  if (existsSync(libDir) && readdirSync(libDir).length === 0) {
    removePath(libDir);
  }
  removePath(join(targetRoot, '.cursor', 'hooks.json'));
}

function removeSkills(targetRoot) {
  const skillsRoot = join(targetRoot, '.cursor', 'skills');
  for (const name of SKILL_DIRS) {
    removePath(join(skillsRoot, name));
  }
}

const opts = parseArgs(process.argv.slice(2));
const target = opts.target;

console.log(`Uninstalling agent-loop from ${target}`);

removePath(join(target, 'scripts', 'agent'));
removePath(join(target, 'tools', 'agent-gui'));
removeHookFiles(target);
removeSkills(target);
removePath(join(target, 'agent-loop.config.json'));

if (!opts.keepData) {
  removePath(join(target, '.agent-loop'));
  removePath(join(target, 'specs', 'agent-tasks'));
} else {
  console.log('Kept .agent-loop/ and specs/agent-tasks/ (--keep-data)');
}

stripPackageScripts(target);
stripSnippet(join(target, 'CLAUDE.md'), 'agent-loop');
stripSnippet(join(target, 'AGENTS.md'), 'agent-loop');

console.log('Done.');
