import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { isValidRepo, loopDir } from './repo-utils.mjs';

function runCommand(cmd, args, cwd) {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, args, {
      cwd: cwd ?? process.cwd(),
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let out = '';
    child.stdout?.on('data', (b) => {
      out += b.toString('utf8');
    });
    child.stderr?.on('data', (b) => {
      out += b.toString('utf8');
    });
    child.on('close', (code) => resolveRun({ code: code ?? 1, out: out.trim() }));
    child.on('error', () => resolveRun({ code: 127, out: '' }));
  });
}

/** @param {string | null} repoRoot */
export function resolveAgentBackend(repoRoot) {
  const fromEnv = (process.env.AGENT_BACKEND ?? 'cursor').toLowerCase();
  if (!repoRoot) return fromEnv === 'claude' ? 'claude' : 'cursor';
  const backendPath = join(loopDir(resolve(repoRoot)), 'backend');
  if (existsSync(backendPath)) {
    try {
      const line = readFileSync(backendPath, 'utf8').trim().toLowerCase();
      if (line === 'claude' || line === 'cursor') return line;
    } catch {
      /* ignore */
    }
  }
  return fromEnv === 'claude' ? 'claude' : 'cursor';
}

/**
 * @param {string | null} repoRoot
 * @returns {Promise<{ ready: boolean; backend: string; repo: string | null; checks: object[] }>}
 */
export async function runSetupChecks(repoRoot) {
  const root = repoRoot ? resolve(repoRoot) : null;
  const backend = resolveAgentBackend(root);
  const cliName = backend === 'claude' ? 'claude' : 'agent';
  const cwd = root ?? process.cwd();

  const workspaceOk = Boolean(root && isValidRepo(root));
  const autostartOk = workspaceOk && existsSync(join(loopDir(root), 'autostart'));

  const version = await runCommand(cliName, ['--version'], cwd);
  const agentInstalled = version.code === 0;

  let agentAuth = false;
  let agentAuthDetail = `Run \`${cliName} login\` in a terminal, then Re-check.`;
  if (agentInstalled) {
    if (backend === 'claude') {
      const auth = await runCommand('claude', ['auth', 'status'], cwd);
      agentAuth = auth.code === 0 && !/not logged in/i.test(auth.out);
      if (!agentAuth && auth.out) agentAuthDetail = auth.out.split('\n')[0];
    } else {
      const status = await runCommand('agent', ['status'], cwd);
      if (status.code === 127) {
        agentAuth = false;
        agentAuthDetail = 'Could not verify login. Run `agent login`, then Re-check.';
      } else {
        agentAuth =
          status.code === 0 &&
          !/not logged in|login required|unauthenticated/i.test(status.out);
        if (!agentAuth && status.out) agentAuthDetail = status.out.split('\n')[0];
      }
    }
  } else {
    agentAuthDetail =
      backend === 'claude'
        ? 'Install Claude Code CLI and run `claude login`.'
        : 'Install Cursor CLI and run `agent login`.';
  }

  const ghVersion = await runCommand('gh', ['--version'], cwd);
  const ghInstalled = ghVersion.code === 0;
  let ghAuth = false;
  if (ghInstalled) {
    const ghStatus = await runCommand('gh', ['auth', 'status'], cwd);
    ghAuth = ghStatus.code === 0;
  }

  /** @type {object[]} */
  const checks = [
    {
      id: 'workspace',
      label: 'Valid Agent Loop workspace',
      ok: workspaceOk,
      required: true,
      detail: workspaceOk
        ? root
        : 'Path must contain `.agent-loop/`, `specs/agent-tasks/`, and `scripts/agent/`.',
      fix: workspaceOk ? null : 'workspace',
    },
    {
      id: 'autostart',
      label: 'Autostart enabled',
      ok: autostartOk,
      required: true,
      detail: autostartOk ? '.agent-loop/autostart present' : 'Required for Agent Console and session hooks.',
      fix: autostartOk ? null : 'autostart',
    },
    {
      id: 'agentInstalled',
      label: `${cliName} CLI installed (${backend})`,
      ok: agentInstalled,
      required: true,
      detail: agentInstalled ? version.out.split('\n')[0] : agentAuthDetail,
      fix: null,
    },
    {
      id: 'agentAuth',
      label: `${cliName} CLI authenticated`,
      ok: agentAuth,
      required: true,
      detail: agentAuth ? 'Ready to run agents' : agentAuthDetail,
      fix: null,
    },
    {
      id: 'gh',
      label: 'GitHub CLI (optional)',
      ok: ghInstalled && ghAuth,
      required: false,
      detail: !ghInstalled
        ? 'Install `gh` for PR badges in the task sidebar.'
        : ghAuth
          ? 'PR status enabled in sidebar'
          : 'Run `gh auth login` for PR badges (optional).',
      fix: null,
    },
  ];

  const ready = checks.filter((c) => c.required).every((c) => c.ok);

  return {
    ready,
    backend,
    repo: root,
    checks,
  };
}
