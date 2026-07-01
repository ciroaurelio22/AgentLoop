#!/usr/bin/env node
/**
 * Install agent-loop into a target repository.
 *
 * Usage:
 *   node bin/install.mjs --target /path/to/repo [--cursor] [--claude] [--gui] [--force]
 *
 * From this kit directory (after git clone):
 *   node bin/install.mjs --target .. --cursor --claude --gui
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectPackageManager } from '../core/scripts/agent/lib/package-manager.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = resolve(__dirname, '..');

const AGENT_SCRIPTS = {
  'agent:status': 'node scripts/agent/status.mjs',
  'agent:init': 'node scripts/agent/init-task.mjs',
  'agent:register': 'node scripts/agent/register-task.mjs',
  'agent:next': 'node scripts/agent/next-task.mjs',
  'agent:verify': 'node scripts/agent/verify-touched.mjs',
  'agent:acceptance': 'node scripts/agent/check-acceptance.mjs',
  'agent:done': 'node scripts/agent/done.mjs',
  'agent:gui': 'node tools/agent-gui/server.mjs',
  'agent:gui:ensure': 'node scripts/agent/ensure-gui.mjs',
  'agent:update': 'node scripts/agent/update.mjs',
  'agent:check-update': 'node scripts/agent/check-update.mjs',
};

function parseArgs(argv) {
  const out = {
    target: process.cwd(),
    cursor: false,
    claude: false,
    gui: false,
    force: false,
    updated: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target' && argv[i + 1]) out.target = resolve(argv[++i]);
    else if (a === '--cursor') out.cursor = true;
    else if (a === '--claude') out.claude = true;
    else if (a === '--gui') out.gui = true;
    else if (a === '--force') out.force = true;
    else if (a === '--updated') out.updated = true;
    else if (a === '--all') {
      out.cursor = true;
      out.claude = true;
      out.gui = true;
    }
  }
  if (!out.cursor && !out.claude && !out.gui) {
    out.cursor = true;
    out.claude = true;
    out.gui = true;
  }
  return out;
}

function copyDir(src, dest, { force = false, skip = () => false } = {}) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (skip(name)) continue;
    const from = join(src, name);
    const to = join(dest, name);
    if (statSync(from).isDirectory()) {
      copyDir(from, to, { force, skip });
    } else if (force || !existsSync(to)) {
      cpSync(from, to);
    }
  }
}

function mergePackageJson(targetRoot) {
  const pkgPath = join(targetRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    writeFileSync(
      pkgPath,
      `${JSON.stringify({ name: 'my-project', private: true, scripts: AGENT_SCRIPTS }, null, 2)}\n`,
    );
    return;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.scripts = { ...(pkg.scripts ?? {}), ...AGENT_SCRIPTS };
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function appendSnippet(targetFile, snippetPath, marker) {
  if (!existsSync(snippetPath)) return;
  const snippet = readFileSync(snippetPath, 'utf8').trim();
  const header = `\n\n<!-- ${marker} -->\n`;
  if (existsSync(targetFile)) {
    const current = readFileSync(targetFile, 'utf8');
    if (current.includes(marker)) return;
    writeFileSync(targetFile, `${current.trimEnd()}${header}${snippet}\n`);
  } else {
    writeFileSync(targetFile, `${snippet}\n`);
  }
}

function installCore(targetRoot, force) {
  const skipUserTask = (name) => force && /^TASK-\d+\.md$/i.test(name);
  copyDir(join(KIT_ROOT, 'core', 'scripts', 'agent'), join(targetRoot, 'scripts', 'agent'), { force });
  copyDir(join(KIT_ROOT, 'core', 'specs', 'agent-tasks'), join(targetRoot, 'specs', 'agent-tasks'), {
    force,
    skip: skipUserTask,
  });

  const loopDest = join(targetRoot, '.agent-loop');
  mkdirSync(loopDest, { recursive: true });
  for (const file of ['queue.json', 'scratchpad.md', 'README.md']) {
    const src = join(KIT_ROOT, 'core', 'agent-loop', file);
    const dest = join(loopDest, file);
    const protectUserData = force && (file === 'queue.json' || file === 'scratchpad.md');
    if (protectUserData && existsSync(dest)) continue;
    if (force || !existsSync(dest)) cpSync(src, dest);
  }

  const versionSrc = join(KIT_ROOT, 'VERSION');
  const versionDest = join(loopDest, 'kit-version');
  if (existsSync(versionSrc)) {
    if (force || !existsSync(versionDest)) cpSync(versionSrc, versionDest);
  }

  const cfgExample = join(KIT_ROOT, 'core', 'agent-loop.config.example.json');
  const cfgDest = join(targetRoot, 'agent-loop.config.json');
  if (!existsSync(cfgDest)) {
    cpSync(cfgExample, cfgDest);
  } else if (force) {
    try {
      const cfg = JSON.parse(readFileSync(cfgDest, 'utf8'));
      if (cfg.verify?.packageManager === 'pnpm') {
        cfg.verify.packageManager = 'auto';
        writeFileSync(cfgDest, `${JSON.stringify(cfg, null, 2)}\n`);
      }
    } catch {
      /* keep existing config */
    }
  }

  mergePackageJson(targetRoot);
}

function installCursor(targetRoot, force) {
  const hooksDest = join(targetRoot, '.cursor', 'hooks');
  copyDir(join(KIT_ROOT, 'adapters', 'cursor', 'hooks'), hooksDest, { force });
  cpSync(join(KIT_ROOT, 'adapters', 'cursor', 'hooks.json'), join(targetRoot, '.cursor', 'hooks.json'));
  installSkills(targetRoot, force);
}

function installSkills(targetRoot, force) {
  const skillsSrc = join(KIT_ROOT, 'adapters', 'cursor', 'skills');
  const skillsDest = join(targetRoot, '.cursor', 'skills');
  copyDir(skillsSrc, skillsDest, { force });
}

function installClaude(targetRoot) {
  appendSnippet(
    join(targetRoot, 'CLAUDE.md'),
    join(KIT_ROOT, 'adapters', 'claude', 'CLAUDE.snippet.md'),
    'agent-loop',
  );
  appendSnippet(
    join(targetRoot, 'AGENTS.md'),
    join(KIT_ROOT, 'adapters', 'claude', 'CLAUDE.snippet.md'),
    'agent-loop',
  );
}

function installGui(targetRoot, force) {
  copyDir(join(KIT_ROOT, 'tools', 'agent-gui'), join(targetRoot, 'tools', 'agent-gui'), { force });
}

function nextTaskId(targetRoot) {
  const nums = [];
  const queuePath = join(targetRoot, '.agent-loop', 'queue.json');
  if (existsSync(queuePath)) {
    try {
      for (const t of JSON.parse(readFileSync(queuePath, 'utf8')).tasks ?? []) {
        const m = /^TASK-(\d+)$/i.exec(String(t.id ?? '').trim());
        if (m) nums.push(Number(m[1]));
      }
    } catch {
      /* ignore */
    }
  }
  const tasksDir = join(targetRoot, 'specs', 'agent-tasks');
  if (existsSync(tasksDir)) {
    for (const name of readdirSync(tasksDir)) {
      const m = /^TASK-(\d+)\.md$/i.exec(name);
      if (m) nums.push(Number(m[1]));
    }
  }
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `TASK-${String(n).padStart(3, '0')}`;
}

function hasExistingLoop(targetRoot) {
  return (
    existsSync(join(targetRoot, '.agent-loop', 'queue.json')) ||
    existsSync(join(targetRoot, '.agent-loop', 'autostart'))
  );
}

function printDoneMessage(targetRoot, opts, detectedPm) {
  const pm = detectedPm === 'npm' ? 'npm' : detectedPm;
  const isUpdate = opts.updated || (opts.force && hasExistingLoop(targetRoot));

  console.log(`\nDetected package manager: ${detectedPm} (verify.packageManager: auto)`);

  if (isUpdate) {
    console.log('\nUpdate complete. Queue, task programs, and scratchpad were preserved.');
    console.log('\nNext steps:');
    console.log(`  1. ${pm} agent:status              # review queue`);
    console.log(`  2. ${pm} agent:gui:ensure          # ensure Agent Console is running`);
    console.log(`  3. ${pm} agent:next                # continue pending task (if any)`);
    console.log('  4. Start a new Cursor Agent session # hooks were refreshed');
    return;
  }

  const taskId = nextTaskId(targetRoot);
  console.log('\nDone. Next steps:');
  console.log(
    '  1. node -e "require(\'node:fs\').mkdirSync(\'.agent-loop\',{recursive:true}); require(\'node:fs\').writeFileSync(\'.agent-loop/autostart\',\'\')"',
  );
  console.log('  2. Edit agent-loop.config.json   # verify + branch defaults');
  console.log(`  3. ${pm} agent:init ${taskId} "First task"`);
  console.log('  4. Install Cursor CLI (agent) or Claude Code CLI (claude) — see README.md');
  console.log('  5. Cursor skills installed: .cursor/skills/uninstall, .cursor/skills/update');
}

const opts = parseArgs(process.argv.slice(2));
const target = opts.target;

console.log(`Installing agent-loop → ${target}`);
installCore(target, opts.force);
if (opts.cursor) installCursor(target, opts.force);
if (opts.claude) installClaude(target);
if (opts.gui) installGui(target, opts.force);

const detectedPm = detectPackageManager(target);
printDoneMessage(target, opts, detectedPm);
