#!/usr/bin/env node
/**
 * Run a coding agent CLI (Cursor or Claude Code) for GUI / automation.
 *
 * Env:
 *   AGENT_BACKEND=cursor|claude|codex  (default: cursor)
 *   AGENT_CLI=/path/to/binary    (override executable)
 *   AGENT_MODEL=...              (backend-specific model id)
 */
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { findAgentCli } from './lib/agent-cli.mjs';
import { loopDir } from './lib/paths.mjs';

const VALID_BACKENDS = new Set(['cursor', 'claude', 'codex']);

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
      'Usage: node run-agent.mjs --workspace <repo> --task specs/agent-tasks/TASK-001.md [--backend cursor|claude|codex] [--model ...]',
    );
    process.exit(2);
  }
  if (!VALID_BACKENDS.has(out.backend)) {
    console.error(`Invalid backend "${out.backend}". Use cursor, claude, or codex.`);
    process.exit(2);
  }
  if (!out.model) {
    if (out.backend === 'claude') out.model = 'sonnet';
    else if (out.backend === 'codex') out.model = 'gpt-5.5';
    else out.model = 'composer-2.5-fast';
  }
  return out;
}

function buildPrompt(taskRel, workspace) {
  const draftPath = join(loopDir(), 'gui-draft-prompt.md').replace(/\\/g, '/');
  return [
    'Complete the agent-loop program task.',
    `Read \`${draftPath}\` for the full user request.`,
    `Explore the codebase and edit ONLY \`${taskRel}\` (plus tests if acceptance requires code).`,
    'Fill Objective, Constraints, Scope, Acceptance (- [ ] checkboxes), Verify, and Notes.',
    'If you need clarification, run `node scripts/agent/ask-user.mjs "your question"` and wait for the GUI answer.',
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

function buildCodexArgs({ workspace, model, prompt }) {
  return [
    'exec',
    '-m',
    model,
    '-C',
    workspace,
    '--sandbox',
    'workspace-write',
    '--json',
    '--dangerously-bypass-approvals-and-sandbox',
    prompt,
  ];
}

function spawnAgent(agentPath, args, workspace, backend) {
  const isCmd = process.platform === 'win32' && agentPath.toLowerCase().endsWith('.cmd');
  const opts = {
    cwd: workspace,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    windowsHide: true,
  };
  if (isCmd) {
    return spawn('cmd.exe', ['/d', '/s', '/c', agentPath, ...args], opts);
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
const agentPath = findAgentCli(
  backend === 'claude' ? 'claude' : backend === 'codex' ? 'codex' : 'cursor',
);
const taskRel = task.replace(/\\/g, '/');
const prompt = buildPrompt(taskRel, workspace);
const args =
  backend === 'claude'
    ? buildClaudeArgs({ workspace, model, prompt })
    : backend === 'codex'
      ? buildCodexArgs({ workspace, model, prompt })
      : buildCursorArgs({ workspace, model, prompt });

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
