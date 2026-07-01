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
};

function parseArgs(argv) {
  const out = {
    target: process.cwd(),
    cursor: false,
    claude: false,
    gui: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target' && argv[i + 1]) out.target = resolve(argv[++i]);
    else if (a === '--cursor') out.cursor = true;
    else if (a === '--claude') out.claude = true;
    else if (a === '--gui') out.gui = true;
    else if (a === '--force') out.force = true;
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

function copyDir(src, dest, { force = false } = {}) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    if (statSync(from).isDirectory()) {
      copyDir(from, to, { force });
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
  copyDir(join(KIT_ROOT, 'core', 'scripts', 'agent'), join(targetRoot, 'scripts', 'agent'), { force });
  copyDir(join(KIT_ROOT, 'core', 'specs', 'agent-tasks'), join(targetRoot, 'specs', 'agent-tasks'), {
    force,
  });

  const loopDest = join(targetRoot, '.agent-loop');
  mkdirSync(loopDest, { recursive: true });
  for (const file of ['queue.json', 'scratchpad.md', 'README.md']) {
    const src = join(KIT_ROOT, 'core', 'agent-loop', file);
    const dest = join(loopDest, file);
    if (force || !existsSync(dest)) cpSync(src, dest);
  }

  const cfgExample = join(KIT_ROOT, 'core', 'agent-loop.config.example.json');
  const cfgDest = join(targetRoot, 'agent-loop.config.json');
  if (!existsSync(cfgDest)) cpSync(cfgExample, cfgDest);

  mergePackageJson(targetRoot);
}

function installCursor(targetRoot, force) {
  const hooksDest = join(targetRoot, '.cursor', 'hooks');
  copyDir(join(KIT_ROOT, 'adapters', 'cursor', 'hooks'), hooksDest, { force });
  cpSync(join(KIT_ROOT, 'adapters', 'cursor', 'hooks.json'), join(targetRoot, '.cursor', 'hooks.json'));
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

const opts = parseArgs(process.argv.slice(2));
const target = opts.target;

console.log(`Installing agent-loop → ${target}`);
installCore(target, opts.force);
if (opts.cursor) installCursor(target, opts.force);
if (opts.claude) installClaude(target);
if (opts.gui) installGui(target, opts.force);

console.log('\nDone. Next steps:');
console.log('  1. node -e "require(\'node:fs\').mkdirSync(\'.agent-loop\',{recursive:true}); require(\'node:fs\').writeFileSync(\'.agent-loop/autostart\',\'\')"');
console.log('  2. Edit agent-loop.config.json   # verify + branch defaults');
console.log('  3. pnpm agent:init TASK-001 "First task"');
console.log('  4. Install Cursor CLI (agent) or Claude Code CLI (claude) — see README.md');
