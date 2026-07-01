import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TASKS_DIR = join(ROOT, 'specs/agent-tasks');

export function defaultProgramPath(taskId) {
  return join(TASKS_DIR, `${taskId}.md`);
}

export function resolveProgramPath(task) {
  if (task.program) {
    return task.program.startsWith('/') ? task.program : join(ROOT, task.program);
  }
  return defaultProgramPath(task.id);
}

export function loadProgram(task) {
  const path = resolveProgramPath(task);
  if (!existsSync(path)) {
    return { path, content: null, missing: true };
  }
  return { path, content: readFileSync(path, 'utf8'), missing: false };
}

export function checkAcceptance(content) {
  const section = content.match(/## Acceptance criteria\s*\n([\s\S]*?)(?=\n## |\n*$)/i);
  if (!section) {
    return { ok: false, unchecked: ['(sezione Acceptance criteria mancante nel program)'] };
  }

  const lines = section[1].split('\n');
  const unchecked = [];
  let found = false;

  for (const line of lines) {
    const open = line.match(/^-\s*\[\s*\]\s*(.*)/);
    const done = line.match(/^-\s*\[[xX]\]\s*(.*)/);
    if (open) {
      found = true;
      unchecked.push(open[1].trim() || '(voce senza testo)');
    } else if (done) {
      found = true;
    }
  }

  if (!found) {
    return { ok: false, unchecked: ['(nessuna voce - [ ] in Acceptance criteria)'] };
  }

  return { ok: unchecked.length === 0, unchecked };
}

export function programPathRelative(task) {
  const path = resolveProgramPath(task);
  return path.replace(`${ROOT}/`, '');
}
