import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** @param {string} repoRoot @param {string} taskId @param {string} title */
export function fillTaskTemplate(repoRoot, taskId, title) {
  const templatePath = join(repoRoot, 'specs', 'agent-tasks', '_template.md');
  if (!existsSync(templatePath)) {
    throw new Error('Template not found: specs/agent-tasks/_template.md');
  }
  const template = readFileSync(templatePath, 'utf8');
  const branchSlug = taskId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return template
    .replaceAll('{{TASK_ID}}', taskId)
    .replaceAll('{{TITLE}}', title)
    .replaceAll('{{BRANCH_SLUG}}', branchSlug)
    .replaceAll('{{DATE}}', new Date().toISOString().slice(0, 10));
}
