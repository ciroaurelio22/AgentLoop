#!/usr/bin/env node
/**
 * Run a coding agent CLI (Cursor or Claude Code) for GUI / automation.
 *
 * Env:
 *   AGENT_BACKEND=cursor|claude  (default: cursor)
 *   AGENT_CLI=/path/to/binary    (override executable)
 *   AGENT_MODEL=...              (backend-specific model id)
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, delimiter as PATH_DELIM } from 'node:path';
import { loopDir } from './lib/paths.mjs';

function parseArgs(argv) {
  const out = {
    workspace: process.cwd(),
    task: '',
    model: process.env.AGENT_MODEL ?? '',
    backend: (process.env.AGENT_BACKEND ?? 'cursor').toLowerCase(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace' && argv[i + 1]) out.workspace = resolve(argv[++i]);
    else if (a === '--task' && argv[i + 1]) out.task = argv[++i];
    else if (a === '--model' && argv[i + 1]) out.model = argv[++i];
    else if (a === '--backend' && argv[i + 1]) out.backend = argv[++i].toLowerCase();
  }
  if (!out.task) {
    console.error(
      'Usage: node run-agent.mjs --workspace <repo> --task specs/agent-tasks/TASK-001.md [--backend cursor|claude] [--model ...]',
    );
    process.exit(2);
  }
  if (!out.model) {
    out.model = out.backend === 'claude' ? 'claude-sonnet-4-6' : 'composer-2.5-fast';
  }
  return out;
}

function findOnPath(names) {
  if (process.env.AGENT_CLI && existsSync(process.env.AGENT_CLI)) {
    return process.env.AGENT_CLI;
  }
  const pathKey = process.env.PATH ?? '';
  for (const dir of pathKey.split(PATH_DELIM)) {
    for (const name of names) {
      const p = join(dir.trim(), name);
      if (p && existsSync(p)) return p;
    }
  }
  return null;
}

function findCursorAgent() {
  const found = findOnPath(['agent.exe', 'agent.cmd', 'agent']);
  if (found) return found;
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
    const shim = join(local, 'cursor-agent', 'agent.cmd');
    if (existsSync(shim)) return shim;
  }
  return 'agent';
}

function findClaudeAgent() {
  return findOnPath(['claude.exe', 'claude.cmd', 'claude']) ?? 'claude';
}

function buildPrompt(taskRel, workspace) {
  const draftPath = join(loopDir(), 'gui-draft-prompt.md').replace(/\\/g, '/');
  return [
    'Complete the agent-loop program task.',
    `Read \`${draftPath}\` for the full user request.`,
    `Explore the codebase and edit ONLY \`${taskRel}\` (plus tests if acceptance requires code).`,
    'Fill Objective, Constraints, Scope, Acceptance (- [ ] checkboxes), Verify, and Notes.',
    'Save the program file when done.',
  ].join(' ');
}

function buildCursorArgs({ workspace, model, prompt }) {
  return [
    '-p',
    '--force',
    '--trust',
    '--approve-mcps',
    '--model',
    model,
    '--workspace',
    workspace,
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    prompt,
  ];
}

function buildClaudeArgs({ workspace, model, prompt }) {
  return [
    '-p',
    prompt,
    '--model',
    model,
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    'Read,Edit,Write,Bash,Glob,Grep',
    '--output-format',
    'stream-json',
  ];
}

function spawnAgent(agentPath, args, workspace, backend) {
  const isCmd = agentPath.toLowerCase().endsWith('.cmd');
  const opts = {
    cwd: workspace,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    windowsHide: true,
  };
  if (process.platform === 'win32' && isCmd) {
    return spawn('cmd.exe', ['/d', '/s', '/c', agentPath, ...args], opts);
  }
  if (backend === 'claude') {
    return spawn(agentPath, args, { ...opts, shell: false });
  }
  return spawn(agentPath, args, { ...opts, shell: false });
}

function killProcessTree(pid) {
  if (!pid || pid <= 0) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* already exited */
  }
}

const { workspace, task, model, backend } = parseArgs(process.argv.slice(2));
const agentPath = backend === 'claude' ? findClaudeAgent() : findCursorAgent();
const taskRel = task.replace(/\\/g, '/');
const prompt = buildPrompt(taskRel, workspace);
const args = backend === 'claude' ? buildClaudeArgs({ workspace, model, prompt }) : buildCursorArgs({ workspace, model, prompt });

console.error(`[run-agent] backend: ${backend}`);
console.error(`[run-agent] binary: ${agentPath}`);
console.error(`[run-agent] workspace: ${workspace}`);
console.error(`[run-agent] task: ${taskRel}`);
console.error(`[run-agent] model: ${model}`);

const child = spawnAgent(agentPath, args, workspace, backend);

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  killProcessTree(child.pid);
  setTimeout(() => process.exit(130), 500);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
if (process.platform === 'win32') {
  process.on('SIGBREAK', shutdown);
}

child.stdout?.on('data', (buf) => process.stdout.write(buf));
child.stderr?.on('data', (buf) => process.stderr.write(buf));

child.on('error', (err) => {
  console.error(`[run-agent] spawn error: ${err.message}`);
  process.exit(127);
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});
