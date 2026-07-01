import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fillProgramTemplate } from '../../scripts/agent/lib/template-fill.mjs';

/** @param {string} repoRoot @param {string} taskId @param {string} title */
export function fillTaskTemplate(repoRoot, taskId, title) {
  const templatePath = join(repoRoot, 'specs', 'agent-tasks', '_template.md');
  if (!existsSync(templatePath)) {
    throw new Error('Template not found: specs/agent-tasks/_template.md');
  }
  const template = readFileSync(templatePath, 'utf8');
  const branchSlug = taskId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return fillProgramTemplate(template, { taskId, title, branchSlug, root: repoRoot });
}
