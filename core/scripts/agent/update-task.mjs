#!/usr/bin/env node
import { readQueue, writeQueue, readState, writeState, findTask } from './lib/queue.mjs';

const [statusArg, taskIdArg] = process.argv.slice(2);

const allowed = new Set(['pending', 'in_progress', 'done', 'blocked']);

if (!statusArg || !allowed.has(statusArg)) {
  console.error('Usage: node scripts/agent/update-task.mjs <pending|in_progress|done|blocked> [TASK-ID]');
  process.exit(1);
}

const queue = readQueue();
const state = readState();
const taskId = taskIdArg ?? state.activeTaskId;

if (!taskId) {
  console.error('Nessun task attivo. Passa TASK-ID esplicito.');
  process.exit(1);
}

const task = findTask(queue, taskId);
if (!task) {
  console.error(`Task non trovato: ${taskId}`);
  process.exit(1);
}

task.status = statusArg;
task.updatedAt = new Date().toISOString();
writeQueue(queue);

if (statusArg === 'done' || statusArg === 'blocked') {
  writeState({ activeTaskId: null, lastLoopAt: new Date().toISOString() });
}

console.log(`Task ${taskId} → ${statusArg}`);
