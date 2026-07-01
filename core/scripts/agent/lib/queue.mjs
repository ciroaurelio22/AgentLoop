import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loopDir } from './paths.mjs';

const QUEUE_PATH = () => join(loopDir(), 'queue.json');
const STATE_PATH = () => join(loopDir(), 'state.json');

const DEFAULT_QUEUE = {
  version: 1,
  defaults: {
    branchPrefix: 'agent',
    branchSuffix: '',
    baseBranch: 'main',
    verify: ['lint', 'typecheck'],
  },
  tasks: [],
};

function ensureLoopDir() {
  const dir = loopDir();
  mkdirSync(dir, { recursive: true });
  if (!existsSync(QUEUE_PATH())) {
    writeFileSync(QUEUE_PATH(), `${JSON.stringify(DEFAULT_QUEUE, null, 2)}\n`);
  }
}

export function readQueue() {
  ensureLoopDir();
  return JSON.parse(readFileSync(QUEUE_PATH(), 'utf8'));
}

export function writeQueue(queue) {
  writeFileSync(QUEUE_PATH(), `${JSON.stringify(queue, null, 2)}\n`);
}

export function readState() {
  if (!existsSync(STATE_PATH())) {
    return { activeTaskId: null, lastLoopAt: null };
  }
  return JSON.parse(readFileSync(STATE_PATH(), 'utf8'));
}

export function writeState(state) {
  writeFileSync(STATE_PATH(), `${JSON.stringify(state, null, 2)}\n`);
}

export function findTask(queue, taskId) {
  return queue.tasks.find((task) => task.id === taskId) ?? null;
}

export function nextPendingTask(queue) {
  return (
    queue.tasks
      .filter((task) => task.status === 'pending')
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))[0] ?? null
  );
}

export function branchName(queue, task) {
  const prefix = queue.defaults?.branchPrefix ?? 'agent';
  const suffix = queue.defaults?.branchSuffix ?? '';
  const slug = task.branchSlug ?? task.id.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return suffix ? `${prefix}/${slug}-${suffix}` : `${prefix}/${slug}`;
}

export function renderTaskPrompt(queue, task, programContent, programPath) {
  const branch = branchName(queue, task);
  const base = queue.defaults?.baseBranch ?? 'main';
  const loopRel = loopDir().replace(`${process.cwd()}/`, '').replace(/\\/g, '/');

  if (programContent) {
    return [
      `# Agent loop — ${task.id}`,
      '',
      `**Program:** \`${programPath}\``,
      `**Branch:** \`${branch}\` → PR on \`${base}\``,
      '',
      '---',
      '',
      programContent.trim(),
      '',
      '---',
      '',
      '## Autonomous loop',
      '',
      '1. Read specs on demand; respect program **Constraints**.',
      '2. Implement; mark `- [x]` on every **Acceptance criteria** item.',
      `3. Update \`${loopRel}/scratchpad.md\`.`,
      '4. Verify: lint + typecheck + **test** on touched packages.',
      '5. Commit, push, update PR.',
      '6. Write `DONE` in scratchpad only when acceptance complete and verify green.',
      '7. No autonomous merge.',
    ].join('\n');
  }

  return [
    `# Agent loop — ${task.id}`,
    '',
    `⚠️ Missing program: \`${programPath}\``,
    '',
    'Create it from `specs/agent-tasks/_template.md` or run `pnpm agent:init`.',
  ].join('\n');
}
