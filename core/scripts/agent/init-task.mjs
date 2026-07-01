#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { readQueue, writeQueue, branchName, findTask } from './lib/queue.mjs';
import { defaultProgramPath } from './lib/program.mjs';

const [taskId, title, ...rest] = process.argv.slice(2);

if (!taskId || !title) {
  console.error('Usage: pnpm agent:init <TASK-ID> "<title>" [--priority 50]');
  process.exit(1);
}

let priority = 50;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--priority' && rest[i + 1]) {
    priority = Number(rest[++i]);
  }
}

const programPath = defaultProgramPath(taskId);
if (existsSync(programPath)) {
  console.error(`Program già esistente: ${programPath.replace(`${process.cwd()}/`, '')}`);
  process.exit(1);
}

const queue = readQueue();
if (findTask(queue, taskId)) {
  console.error(`Task già in coda: ${taskId}`);
  process.exit(1);
}

const templatePath = join(process.cwd(), 'specs/agent-tasks/_template.md');
const branchSlug = taskId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const template = readFileSync(templatePath, 'utf8');
const program = template
  .replaceAll('{{TASK_ID}}', taskId)
  .replaceAll('{{TITLE}}', title)
  .replaceAll('{{BRANCH_SLUG}}', branchSlug)
  .replaceAll('{{DATE}}', new Date().toISOString().slice(0, 10));

writeFileSync(programPath, program);

const task = {
  id: taskId,
  title,
  program: `specs/agent-tasks/${taskId}.md`,
  status: 'pending',
  priority,
  branchSlug,
  createdAt: new Date().toISOString(),
};

queue.tasks.push(task);
writeQueue(queue);

console.log(`Creato program: specs/agent-tasks/${taskId}.md`);
console.log(`In coda: ${taskId} (priority ${priority}) → branch ${branchName(queue, task)}`);
console.log('');
console.log('Prossimi passi:');
console.log(`  1. Compila specs/agent-tasks/${taskId}.md (obiettivo, vincoli, acceptance)`);
console.log(`  2. pnpm agent:next`);
console.log('  3. Avvia Cloud/Background Agent');
