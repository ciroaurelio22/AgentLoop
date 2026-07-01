#!/usr/bin/env node
import { readQueue, readState } from './lib/queue.mjs';
import { programPathRelative } from './lib/program.mjs';

const queue = readQueue();
const state = readState();

const counts = queue.tasks.reduce(
  (acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  },
  {},
);

console.log('Agent loop queue');
console.log('----------------');
console.log(`Active: ${state.activeTaskId ?? '(none)'}`);
console.log(`Pending: ${counts.pending ?? 0} | In progress: ${counts.in_progress ?? 0} | Done: ${counts.done ?? 0} | Blocked: ${counts.blocked ?? 0}`);

if (queue.tasks.length === 0) {
  console.log('\nCoda vuota. Vedi specs/agent-tasks/README.md');
}

for (const task of queue.tasks) {
  const program = programPathRelative(task);
  console.log(`- [${task.status}] ${task.id}: ${task.title ?? ''} (${program})`);
}
