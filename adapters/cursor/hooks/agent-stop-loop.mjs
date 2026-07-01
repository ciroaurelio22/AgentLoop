#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { emitEmpty, emitJson, readHookInput, repoRoot, resolveLoopDir } from './lib/hook-io.mjs';

const input = readHookInput();
const status = input.status ?? 'completed';
const loopCount = Number(input.loop_count ?? 0);

const root = repoRoot();
process.chdir(root);

const scratchpad = join(resolveLoopDir(root), 'scratchpad.md');
const maxLoops = Number(process.env.AGENT_LOOP_LIMIT ?? 8);

function runNode(args) {
  return execFileSync('node', args, { cwd: root, encoding: 'utf8' });
}

function runNodeAllowFail(args) {
  try {
    return runNode(args);
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

function formatFailures(verifyJson) {
  const failures = verifyJson?.failures ?? [];
  const text = failures
    .map((f) => `${f.step} @ ${f.package}:\n${f.output ?? ''}`)
    .join('\n\n');
  return text.slice(0, 3500);
}

function resolveTaskToComplete(activeTaskId) {
  try {
    if (activeTaskId) {
      const q = JSON.parse(readFileSync(join(root, '.cursor/agent-loop/queue.json'), 'utf8'));
      const t = (q.tasks ?? []).find(
        (x) => x.id === activeTaskId && x.status !== 'done' && x.status !== 'blocked',
      );
      if (t) {
        return activeTaskId;
      }
    }
  } catch {
    // ignore
  }

  try {
    const q = JSON.parse(readFileSync(join(root, '.cursor/agent-loop/queue.json'), 'utf8'));
    const inProg = (q.tasks ?? []).filter((t) => t.status === 'in_progress');
    if (inProg.length === 1) {
      return inProg[0].id;
    }
  } catch {
    // ignore
  }

  try {
    const s = readFileSync(scratchpad, 'utf8');
    const m = s.match(/\*\*ID:\*\*\s*(\S+)/);
    if (m?.[1] && m[1] !== '(nessuno)') {
      return m[1];
    }
  } catch {
    // ignore
  }

  return '';
}

function readActiveTaskId() {
  try {
    const s = JSON.parse(readFileSync(join(root, '.cursor/agent-loop/state.json'), 'utf8'));
    return s.activeTaskId ?? '';
  } catch {
    return '';
  }
}

if (status !== 'completed' || loopCount >= maxLoops) {
  emitEmpty();
}

if (hasDoneLine()) {
  const verifyRaw = runNodeAllowFail(['scripts/agent/verify-touched.mjs']);
  const verifyJson = parseJson(verifyRaw);
  const verifyOk = verifyJson?.ok === true;

  if (!verifyOk) {
    removeDoneLine();
    emitJson({
      followup_message: `[Agent loop] DONE rifiutato: verifica fallita (lint/typecheck/test). Correggi:

${formatFailures(verifyJson)}

Poi riscrivi DONE nello scratchpad.`,
    });
  }

  const activeTask = readActiveTaskId();
  const taskToComplete = resolveTaskToComplete(activeTask);

  if (taskToComplete) {
    const acceptanceRaw = runNodeAllowFail([
      'scripts/agent/check-acceptance.mjs',
      taskToComplete,
    ]);
    const acceptanceJson = parseJson(acceptanceRaw);
    const acceptanceOk = acceptanceJson?.ok === true;

    if (!acceptanceOk) {
      removeDoneLine();
      const unchecked = (acceptanceJson?.unchecked ?? []).slice(0, 5).join('\n');
      emitJson({
        followup_message: `[Agent loop] DONE rifiutato: acceptance criteria non complete nel program.

Spunta tutte le voci - [x] in specs/agent-tasks/${taskToComplete}.md

Mancanti:
${unchecked}

Poi riscrivi DONE nello scratchpad.`,
      });
    }

    try {
      runNode(['scripts/agent/update-task.mjs', 'done', taskToComplete]);
    } catch {
      // non-blocking
    }
  }

  removeDoneLine();

  const nextJson = parseJson(runNodeAllowFail(['scripts/agent/next-task.mjs', '--json'])) ?? {
    task: null,
  };
  if (nextJson.task?.id) {
    const nextPrompt = runNodeAllowFail(['scripts/agent/next-task.mjs']).trim();
    emitJson({
      followup_message: `[Agent loop] Task completato. Prossimo task:

${nextPrompt}`,
    });
  }

  emitEmpty();
}

const verifyRaw = runNodeAllowFail(['scripts/agent/verify-touched.mjs']);
const verifyJson = parseJson(verifyRaw);
const verifyOk = verifyJson?.ok === true;

if (!verifyOk) {
  emitJson({
    followup_message: `[Agent loop iter ${loopCount + 1}/${maxLoops}] Verifica fallita (lint/typecheck/test). Correggi:

${formatFailures(verifyJson)}

Spunta acceptance nel program, aggiorna scratchpad, scrivi DONE quando finito.`,
  });
}

emitJson({
  followup_message: `[Agent loop iter ${loopCount + 1}/${maxLoops}] Lint, typecheck e test ok sui package toccati.

Completa acceptance (- [x] nel program), commit/push/PR, poi scrivi DONE nello scratchpad.`,
});
