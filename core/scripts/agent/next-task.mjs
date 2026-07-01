#!/usr/bin/env node
import { readQueue, readState, writeState, writeQueue, nextPendingTask, renderTaskPrompt } from './lib/queue.mjs';
import { loadProgram, programPathRelative } from './lib/program.mjs';
import { loopDir } from './lib/paths.mjs';

const args = new Set(process.argv.slice(2));
const asContext = args.has('--context');
const asJson = args.has('--json');
const taskIdArg = process.argv.find((arg) => arg.startsWith('--id='))?.slice(5);

const queue = readQueue();
const state = readState();
const loopRel = loopDir().replace(`${process.cwd()}/`, '').replace(/\\/g, '/');

const activeFromState = state.activeTaskId
  ? queue.tasks.find(
      (t) =>
        t.id === state.activeTaskId && t.status !== 'done' && t.status !== 'blocked',
    )
  : null;
if (state.activeTaskId && !activeFromState) {
  writeState({ activeTaskId: null, lastLoopAt: state.lastLoopAt ?? null });
}

const task =
  (taskIdArg
    ? queue.tasks.find(
        (t) =>
          t.id === taskIdArg && t.status !== 'done' && t.status !== 'blocked',
      )
    : null) ??
  activeFromState ??
  nextPendingTask(queue);

if (!task) {
  if (asJson) {
    console.log(JSON.stringify({ task: null, message: `No pending tasks in ${loopRel}/queue.json` }));
  } else if (asContext) {
    console.log('{}');
  } else {
    console.log('No pending tasks. Create specs/agent-tasks/<ID>.md and run `pnpm agent:register <ID>`.');
  }
  process.exit(0);
}

if (task.status === 'pending') {
  task.status = 'in_progress';
  writeQueue(queue);
  writeState({ activeTaskId: task.id, lastLoopAt: new Date().toISOString() });
}

const program = loadProgram(task);
const relPath = programPathRelative(task);
const prompt = renderTaskPrompt(queue, task, program.content, relPath);

if (asJson) {
  console.log(JSON.stringify({ task, program: relPath, programMissing: program.missing, prompt }, null, 2));
  process.exit(0);
}

if (asContext) {
  console.log(
    JSON.stringify({
      additional_context: `[Agent Loop]\n\n${prompt}`,
      env: { AGENT_LOOP: '1', AGENT_LOOP_ACTIVE_TASK: task.id },
    }),
  );
  process.exit(0);
}

console.log(prompt);
