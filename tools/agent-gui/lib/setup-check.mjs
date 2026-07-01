import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isValidRepo, loopDir } from './repo-utils.mjs';
import { resolveAgentScriptForRepo } from './agent-scripts.mjs';

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

/** @param {string | null} repoRoot @param {'cursor' | 'claude'} backend */
async function loadAgentCliProbe(repoRoot, backend) {
  const scriptPath = resolveAgentScriptForRepo(repoRoot ?? process.cwd(), 'lib', 'agent-cli.mjs');
  if (!existsSync(scriptPath)) {
    return {
      binary: backend === 'claude' ? 'claude' : 'agent',
      installed: false,
      authenticated: false,
      versionDetail: 'Agent scripts not found in this workspace.',
      authDetail: 'Install agent-loop scripts in the repo.',
    };
  }
  const mod = await import(pathToFileURL(scriptPath).href);
  return mod.probeAgentCli(backend, repoRoot ?? process.cwd());
}

/**
 * @param {string | null} repoRoot
 * @returns {Promise<{ ready: boolean; backend: string; repo: string | null; checks: object[] }>}
 */
export async function runSetupChecks(repoRoot) {
  const root = repoRoot ? resolve(repoRoot) : null;
  const backend = resolveAgentBackend(root);
  /** @type {'cursor' | 'claude'} */
  const backendId = backend === 'claude' ? 'claude' : 'cursor';
  const cliName = backendId === 'claude' ? 'claude' : 'agent';
  const cwd = root ?? process.cwd();

  const workspaceOk = Boolean(root && isValidRepo(root));
  const autostartOk = workspaceOk && existsSync(join(loopDir(root), 'autostart'));

  const cli = await loadAgentCliProbe(root, backendId);

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
      label: `${cliName} CLI installed (${backendId})`,
      ok: cli.installed,
      required: true,
      detail: cli.installed ? `${cli.versionDetail} (${cli.binary})` : cli.versionDetail,
      fix: null,
    },
    {
      id: 'agentAuth',
      label: `${cliName} CLI authenticated`,
      ok: cli.authenticated,
      required: true,
      detail: cli.authenticated ? 'Ready to run agents' : cli.authDetail,
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
    backend: backendId,
    repo: root,
    checks,
  };
}
