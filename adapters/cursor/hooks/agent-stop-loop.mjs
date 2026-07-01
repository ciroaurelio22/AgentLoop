#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  emitEmpty,
  emitJson,
  readHookInput,
  repoRoot,
  resolveAgentScript,
  resolveLoopDir,
} from './lib/hook-io.mjs';

const input = readHookInput();
const status = input.status ?? 'completed';
const loopCount = Number(input.loop_count ?? 0);
const composerMode = input.composer_mode ?? '';

const root = repoRoot();
process.chdir(root);

const loopDirPath = resolveLoopDir(root);
const scratchpad = join(loopDirPath, 'scratchpad.md');
const queuePath = join(loopDirPath, 'queue.json');
const statePath = join(loopDirPath, 'state.json');
const maxLoops = Number(process.env.AGENT_LOOP_LIMIT ?? 8);

function runNode(scriptParts, args = []) {
  const script = resolveAgentScript(root, ...scriptParts);
  return execFileSync('node', [script, ...args], { cwd: root, encoding: 'utf8' });
}

function runNodeAllowFail(scriptParts, args = []) {
  try {
    return runNode(scriptParts, args);
  } catch (err) {
    return err.stdout?.toString?.() ?? err.message ?? '';
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readQueue() {
  try {
    return JSON.parse(readFileSync(queuePath, 'utf8'));
  } catch {
    return { tasks: [] };
  }
}

function readActiveTaskId() {
  try {
    const s = JSON.parse(readFileSync(statePath, 'utf8'));
    return s.activeTaskId ?? '';
  } catch {
    return '';
  }
}

function isTaskInProgress(taskId) {
  if (!taskId) return false;
  const task = (readQueue().tasks ?? []).find((t) => t.id === taskId);
  return task?.status === 'in_progress';
}

function hasInProgressTask() {
  return (readQueue().tasks ?? []).some((t) => t.status === 'in_progress');
}

function removeDoneLine() {
  if (!existsSync(scratchpad)) {
    return;
  }
  const content = readFileSync(scratchpad, 'utf8');
  const next = content
    .split('\n')
    .filter((line) => !/^DONE\s*$/.test(line))
    .join('\n');
  writeFileSync(scratchpad, next.endsWith('\n') || next.length === 0 ? next : `${next}\n`, 'utf8');
}

function hasDoneLine() {
  if (!existsSync(scratchpad)) {
    return false;
  }
  return /^DONE\s*$/m.test(readFileSync(scratchpad, 'utf8'));
}

function isAgentLoopActive() {
  if (process.env.AGENT_LOOP === '1') return true;
  if (hasDoneLine()) return true;
  const activeTaskId = readActiveTaskId();
  if (activeTaskId && isTaskInProgress(activeTaskId)) return true;
  return hasInProgressTask();
}

function formatFailures(verifyJson) {
  const failures = verifyJson?.failures ?? [];
  const text = failures
    .map((f) => `${f.step} @ ${f.package}:\n${f.output ?? ''}`)
    .join('\n\n');
  return text.slice(0, 3500);
}

function resolveTaskToComplete(activeTaskId) {
  if (activeTaskId && isTaskInProgress(activeTaskId)) {
    return activeTaskId;
  }

  const inProg = (readQueue().tasks ?? []).filter((t) => t.status === 'in_progress');
  if (inProg.length === 1) {
    return inProg[0].id;
  }

  try {
    const s = readFileSync(scratchpad, 'utf8');
    const m = s.match(/\*\*ID:\*\*\s*(\S+)/);
    if (m?.[1] && m[1] !== '(nessuno)') {
      return m[1];
    }
  } catch {
    /* ignore */
  }

  return '';
}

if (status !== 'completed' || loopCount >= maxLoops) {
  emitEmpty();
}

if (composerMode === 'ask') {
  emitEmpty();
}

if (!isAgentLoopActive()) {
  emitEmpty();
}

if (hasDoneLine()) {
  const verifyRaw = runNodeAllowFail(['verify-touched.mjs']);
  const verifyJson = parseJson(verifyRaw);
  const verifyOk = verifyJson?.ok === true;

  if (!verifyOk) {
    removeDoneLine();
    emitJson({
      followup_message: `[Agent loop] DONE rejected: verify failed (lint/typecheck/test). Fix:

${formatFailures(verifyJson)}

Then write DONE again in scratchpad.`,
    });
  }

  const activeTask = readActiveTaskId();
  const taskToComplete = resolveTaskToComplete(activeTask);

  if (taskToComplete) {
    const acceptanceRaw = runNodeAllowFail(['check-acceptance.mjs', taskToComplete]);
    const acceptanceJson = parseJson(acceptanceRaw);
    const acceptanceOk = acceptanceJson?.ok === true;

    if (!acceptanceOk) {
      removeDoneLine();
      const unchecked = (acceptanceJson?.unchecked ?? []).slice(0, 5).join('\n');
      emitJson({
        followup_message: `[Agent loop] DONE rejected: acceptance criteria incomplete in program.

Check every - [x] in specs/agent-tasks/${taskToComplete}.md

Missing:
${unchecked}

Then write DONE again in scratchpad.`,
      });
    }

    try {
      runNode(['update-task.mjs', 'done', taskToComplete]);
    } catch {
      /* non-blocking */
    }
  }

  removeDoneLine();

  const nextJson = parseJson(runNodeAllowFail(['next-task.mjs', '--json'])) ?? { task: null };
  if (nextJson.task?.id) {
    const nextPrompt = runNodeAllowFail(['next-task.mjs']).trim();
    emitJson({
      followup_message: `[Agent loop] Task completed. Next task:

${nextPrompt}`,
    });
  }

  emitEmpty();
}

const verifyRaw = runNodeAllowFail(['verify-touched.mjs']);
const verifyJson = parseJson(verifyRaw);
const verifyOk = verifyJson?.ok === true;
const packages = verifyJson?.packages ?? [];

if (packages.length === 0 && process.env.AGENT_LOOP !== '1') {
  emitEmpty();
}

if (!verifyOk) {
  emitJson({
    followup_message: `[Agent loop iter ${loopCount + 1}/${maxLoops}] Verify failed (lint/typecheck/test). Fix:

${formatFailures(verifyJson)}

Check acceptance in the program, update scratchpad, write DONE when finished.`,
  });
}

emitJson({
  followup_message: `[Agent loop iter ${loopCount + 1}/${maxLoops}] Lint, typecheck, and tests passed on touched packages.

Complete acceptance (- [x] in program), commit/push/PR, then write DONE in scratchpad.`,
});
