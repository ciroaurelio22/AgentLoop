#!/usr/bin/env node
import { readQueue, readState } from './lib/queue.mjs';
import { loadProgram, checkAcceptance, programPathRelative } from './lib/program.mjs';

const taskId = process.argv[2] ?? readState().activeTaskId;

if (!taskId) {
  console.error('Usage: pnpm agent:acceptance [TASK-ID]');
  process.exit(1);
}

const queue = readQueue();
const task = queue.tasks.find((t) => t.id === taskId);
if (!task) {
  console.error(`Task non in coda: ${taskId}`);
  process.exit(1);
}

const program = loadProgram(task);
if (program.missing) {
  console.error(`Program mancante: ${programPathRelative(task)}`);
  process.exit(1);
}

const result = checkAcceptance(program.content);
console.log(JSON.stringify({ taskId, program: programPathRelative(task), ...result }, null, 2));
process.exit(result.ok ? 0 : 1);
