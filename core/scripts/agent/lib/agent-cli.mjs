import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter as PATH_DELIM } from 'node:path';

function findOnPath(names) {
  if (process.env.AGENT_CLI && existsSync(process.env.AGENT_CLI)) {
    return process.env.AGENT_CLI;
  }
  const pathKey = process.env.PATH ?? '';
  for (const dir of pathKey.split(PATH_DELIM)) {
    for (const name of names) {
      const p = join(dir.trim(), name);
      if (p && existsSync(p)) return p;
    }
  }
  return null;
}

/** @param {'cursor' | 'claude' | 'codex'} backend */
export function findAgentCli(backend) {
  if (backend === 'claude') {
    return findOnPath(['claude.exe', 'claude.cmd', 'claude']) ?? 'claude';
  }
  if (backend === 'codex') {
    return findOnPath(['codex.exe', 'codex.cmd', 'codex']) ?? 'codex';
  }
  const found = findOnPath(['agent.exe', 'agent.cmd', 'agent']);
  if (found) return found;
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
    const shim = join(local, 'cursor-agent', 'agent.cmd');
    if (existsSync(shim)) return shim;
  }
  return 'agent';
}

/**
 * @param {string} binary
 * @param {string[]} args
 * @param {string} [cwd]
 */
export function runAgentCli(binary, args, cwd) {
  return new Promise((resolveRun) => {
    const isCmd = process.platform === 'win32' && binary.toLowerCase().endsWith('.cmd');
    const child = isCmd
      ? spawn('cmd.exe', ['/d', '/s', '/c', binary, ...args], {
          cwd,
          shell: false,
          windowsHide: true,
          env: process.env,
        })
      : spawn(binary, args, {
          cwd,
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
    child.on('close', (code) => resolveRun({ code: code ?? 1, out: out.trim(), binary }));
    child.on('error', (err) =>
      resolveRun({ code: 127, out: err.message ?? '', binary }),
    );
  });
}

/** @param {'cursor' | 'claude' | 'codex'} backend @param {string} [cwd] */
export async function probeAgentCli(backend, cwd) {
  const binary = findAgentCli(backend);
  const version = await runAgentCli(binary, ['--version'], cwd);
  const installed = version.code === 0;

  let authenticated = false;
  let authDetail = `Run \`${backend === 'claude' ? 'claude' : backend === 'codex' ? 'codex' : 'agent'} login\` in a terminal, then Re-check.`;

  if (!installed) {
    return {
      binary,
      installed: false,
      authenticated: false,
      versionDetail:
        backend === 'claude'
          ? 'Install Claude Code CLI and run `claude login`.'
          : backend === 'codex'
            ? 'Install OpenAI Codex CLI and run `codex login`.'
            : 'Install Cursor CLI and run `agent login`.',
      authDetail,
    };
  }

  if (backend === 'claude') {
    const auth = await runAgentCli(binary, ['auth', 'status'], cwd);
    authenticated = auth.code === 0 && !/not logged in/i.test(auth.out);
    if (!authenticated && auth.out) authDetail = auth.out.split('\n')[0];
  } else if (backend === 'codex') {
    const auth = await runAgentCli(binary, ['login', 'status'], cwd);
    authenticated = auth.code === 0;
    if (!authenticated && auth.out) authDetail = auth.out.split('\n')[0];
  } else {
    const status = await runAgentCli(binary, ['status'], cwd);
    authenticated =
      status.code === 0 &&
      (/logged in/i.test(status.out) ||
        !/not logged in|login required|unauthenticated/i.test(status.out));
    if (!authenticated && status.out) authDetail = status.out.split('\n')[0];
  }

  return {
    binary,
    installed: true,
    authenticated,
    versionDetail: version.out.split('\n')[0] || binary,
    authDetail,
  };
}
