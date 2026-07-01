import { detectPackageManager, pmRun } from './package-manager.mjs';

/**
 * @param {string} template
 * @param {{ taskId: string; title: string; branchSlug: string; date?: string; root?: string }} opts
 */
export function fillProgramTemplate(template, opts) {
  const root = opts.root ?? process.cwd();
  const pm = detectPackageManager(root);
  const date = opts.date ?? new Date().toISOString().slice(0, 10);

  return template
    .replaceAll('{{TASK_ID}}', opts.taskId)
    .replaceAll('{{TITLE}}', opts.title)
    .replaceAll('{{BRANCH_SLUG}}', opts.branchSlug)
    .replaceAll('{{DATE}}', date)
    .replaceAll('{{PM}}', pm)
    .replaceAll('{{AGENT_REGISTER_CMD}}', pmRun(pm, 'agent:register'));
}
