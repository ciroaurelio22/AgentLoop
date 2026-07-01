#!/usr/bin/env node
import { readQueue, writeQueue, branchName, findTask } from './lib/queue.mjs';
import { loadProgram, programPathRelative } from './lib/program.mjs';

const [taskId, ...rest] = process.argv.slice(2);

if (!taskId) {
  console.error('Usage: pnpm agent:register <TASK-ID> [--priority 50] [--title "override"]');
  process.exit(1);
}

let priority = 50;
let titleOverride = null;

for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--priority' && rest[i + 1]) {
    priority = Number(rest[++i]);
  } else if (rest[i] === '--title' && rest[i + 1]) {
    titleOverride = rest[++i];
  }
}

const stubTask = { id: taskId, program: `specs/agent-tasks/${taskId}.md` };
const program = loadProgram(stubTask);

if (program.missing) {
  console.error(`Program non trovato: ${programPathRelative(stubTask)}`);
  console.error('Crea il file da specs/agent-tasks/_template.md oppure usa pnpm agent:init');
  process.exit(1);
}

const queue = readQueue();
if (findTask(queue, taskId)) {
  console.error(`Task già in coda: ${taskId}`);
  process.exit(1);
}

const titleMatch = program.content.match(/^#\s+\S+\s+—\s+(.+)$/m);
const title = titleOverride ?? titleMatch?.[1]?.trim() ?? taskId;

const task = {
  id: taskId,
  title,
  program: `specs/agent-tasks/${taskId}.md`,
  status: 'pending',
  priority,
  branchSlug: taskId.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  createdAt: new Date().toISOString(),
};

queue.tasks.push(task);
writeQueue(queue);

console.log(`Registrato ${taskId} → ${programPathRelative(task)}`);
console.log(`Branch: ${branchName(queue, task)}`);
