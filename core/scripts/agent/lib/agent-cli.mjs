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

/** @param {'cursor' | 'claude'} backend */
export function findAgentCli(backend) {
  if (backend === 'claude') {
    return findOnPath(['claude.exe', 'claude.cmd', 'claude']) ?? 'claude';
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

/** @param {'cursor' | 'claude'} backend @param {string} [cwd] */
export async function probeAgentCli(backend, cwd) {
  const binary = findAgentCli(backend);
  const version = await runAgentCli(binary, ['--version'], cwd);
  const installed = version.code === 0;

  let authenticated = false;
  let authDetail = `Run \`${backend === 'claude' ? 'claude' : 'agent'} login\` in a terminal, then Re-check.`;

  if (!installed) {
    return {
      binary,
      installed: false,
      authenticated: false,
      versionDetail:
        backend === 'claude'
          ? 'Install Claude Code CLI and run `claude login`.'
          : 'Install Cursor CLI and run `agent login`.',
      authDetail,
    };
  }

  if (backend === 'claude') {
    const auth = await runAgentCli(binary, ['auth', 'status'], cwd);
    authenticated = auth.code === 0 && !/not logged in/i.test(auth.out);
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

/** @type {{ id: string; label: string }[]} */
const CLAUDE_FALLBACK_MODELS = [
  { id: 'sonnet', label: 'Sonnet (alias)' },
  { id: 'opus', label: 'Opus (alias)' },
  { id: 'haiku', label: 'Haiku (alias)' },
  { id: 'fable', label: 'Fable (alias)' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-fable-5', label: 'Fable 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];

/**
 * @param {string} text
 * @returns {{ id: string; label: string }[]}
 */
export function parseAgentModelsOutput(text) {
  /** @type {{ id: string; label: string }[]} */
  const models = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || /^available models/i.test(trimmed)) continue;
    const match = /^(\S+)\s+-\s+(.+)$/.exec(trimmed);
    if (match) {
      models.push({ id: match[1], label: match[2].trim() });
    }
  }
  return models;
}

/**
 * @param {string} text
 * @returns {{ id: string; label: string }[]}
 */
export function parseClaudeModelListOutput(text) {
  /** @type {{ id: string; label: string }[]} */
  const models = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || /^available models|^model id|^[-|]/i.test(trimmed)) continue;
    const pipe = trimmed.split('|').map((part) => part.trim());
    if (pipe.length >= 2 && pipe[0]) {
      models.push({ id: pipe[0], label: pipe.slice(1).join(' · ') || pipe[0] });
      continue;
    }
    const dash = /^(\S+)\s+-\s+(.+)$/.exec(trimmed);
    if (dash) models.push({ id: dash[1], label: dash[2].trim() });
  }
  return models;
}

/**
 * @param {'cursor' | 'claude'} backend
 * @param {string} [cwd]
 * @returns {Promise<{ models: { id: string; label: string }[]; source: 'cli' | 'fallback'; error?: string }>}
 */
export async function listAgentModels(backend, cwd) {
  const binary = findAgentCli(backend);

  if (backend === 'cursor') {
    let result = await runAgentCli(binary, ['models'], cwd);
    if (result.code !== 0) {
      result = await runAgentCli(binary, ['--list-models'], cwd);
    }
    if (result.code !== 0) {
      return {
        models: [],
        source: 'cli',
        error: result.out || 'Could not list Cursor models (`agent models`).',
      };
    }
    const models = parseAgentModelsOutput(result.out);
    if (!models.length) {
      return {
        models: [],
        source: 'cli',
        error: 'Cursor CLI returned no models.',
      };
    }
    return { models, source: 'cli' };
  }

  const listCmd = await runAgentCli(binary, ['model', 'list'], cwd);
  if (listCmd.code === 0) {
    const models = parseClaudeModelListOutput(listCmd.out);
    if (models.length) return { models, source: 'cli' };
  }

  return {
    models: CLAUDE_FALLBACK_MODELS,
    source: 'fallback',
    error:
      'Claude Code CLI has no non-interactive model list yet; showing common `--model` values.',
  };
}
