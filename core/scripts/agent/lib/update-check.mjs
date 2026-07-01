import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_REPO = 'ciroaurelio22/AgentLoop';
export const DEFAULT_BRANCH = 'master';
export const DEFAULT_INTERVAL_DAYS = 7;

function loopDir(root) {
  if (process.env.AGENT_LOOP_DIR) return join(root, process.env.AGENT_LOOP_DIR);
  if (existsSync(join(root, '.agent-loop'))) return join(root, '.agent-loop');
  return join(root, '.agent-loop');
}

function loadConfig(root) {
  const path = join(root, 'agent-loop.config.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function readState(loop) {
  const path = join(loop, 'update-check.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(loop, state) {
  mkdirSync(loop, { recursive: true });
  writeFileSync(join(loop, 'update-check.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function readLocalVersion(root) {
  const loop = loopDir(root);
  const candidates = [
    join(loop, 'kit-version'),
    join(root, 'VERSION'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const v = readFileSync(path, 'utf8').trim();
    if (v) return v;
  }
  return null;
}

export function compareVersions(a, b) {
  const pa = String(a).trim().replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
  const pb = String(b).trim().replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export async function fetchRemoteVersion({ repo = DEFAULT_REPO, branch = DEFAULT_BRANCH } = {}) {
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/VERSION`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Remote VERSION not reachable (${res.status})`);
  const text = (await res.text()).trim();
  if (!text) throw new Error('Remote VERSION is empty');
  return text;
}

function shouldRunNetworkCheck(state, cfg, { force = false } = {}) {
  if (force) return true;
  if (cfg.updateCheck?.enabled === false) return false;
  if (state.snoozedUntil && Date.now() < Date.parse(state.snoozedUntil)) return false;
  const days = cfg.updateCheck?.intervalDays ?? DEFAULT_INTERVAL_DAYS;
  const intervalMs = days * 86400000;
  if (state.lastCheckAt && Date.now() - Date.parse(state.lastCheckAt) < intervalMs) return false;
  return true;
}

function buildNotice({ local, remote }) {
  return [
    '---',
    `**Agent Loop — update disponibile** (\`v${local}\` → \`v${remote}\`).`,
    'Usa la skill **agent-loop-update** oppure `pnpm agent:update`.',
    'Posticipa: `pnpm agent:check-update --snooze 7`',
    '---',
  ].join('\n');
}

/**
 * @param {{ root?: string; force?: boolean; hook?: boolean; snoozeDays?: number; dismiss?: boolean }} opts
 */
export async function checkForUpdate(opts = {}) {
  const root = opts.root ?? process.cwd();
  const loop = loopDir(root);
  const cfg = loadConfig(root);
  const repo = cfg.updateCheck?.repo ?? DEFAULT_REPO;
  const branch = cfg.updateCheck?.branch ?? DEFAULT_BRANCH;
  let state = readState(loop);

  if (opts.snoozeDays) {
    const until = new Date(Date.now() + opts.snoozeDays * 86400000).toISOString();
    state = { ...state, snoozedUntil: until };
    writeState(loop, state);
    return { ok: true, snoozedUntil: until, checked: false };
  }

  if (opts.dismiss) {
    const remote = state.lastRemoteVersion ?? null;
    state = { ...state, dismissedVersion: remote, snoozedUntil: null };
    writeState(loop, state);
    return { ok: true, dismissedVersion: remote, checked: false };
  }

  const local = readLocalVersion(root);
  if (!local) {
    return { ok: true, checked: false, reason: 'no-local-version' };
  }

  if (!shouldRunNetworkCheck(state, cfg, { force: opts.force })) {
    return {
      ok: true,
      checked: false,
      reason: 'throttled',
      local,
      nextCheckAfter: state.lastCheckAt
        ? new Date(
            Date.parse(state.lastCheckAt) +
              (cfg.updateCheck?.intervalDays ?? DEFAULT_INTERVAL_DAYS) * 86400000,
          ).toISOString()
        : null,
    };
  }

  let remote;
  try {
    remote = await fetchRemoteVersion({ repo, branch });
  } catch (err) {
    state = {
      ...state,
      lastCheckAt: new Date().toISOString(),
      lastError: err instanceof Error ? err.message : String(err),
    };
    writeState(loop, state);
    return {
      ok: false,
      checked: true,
      error: err instanceof Error ? err.message : String(err),
      local,
    };
  }

  const cmp = compareVersions(remote, local);
  const updateAvailable = cmp > 0;
  const dismissed = state.dismissedVersion === remote;

  state = {
    ...state,
    lastCheckAt: new Date().toISOString(),
    lastRemoteVersion: remote,
    localVersionAtCheck: local,
    lastError: null,
  };
  writeState(loop, state);

  if (!updateAvailable) {
    return { ok: true, checked: true, updateAvailable: false, local, remote, upToDate: true };
  }

  if (dismissed && !opts.force) {
    return {
      ok: true,
      checked: true,
      updateAvailable: false,
      local,
      remote,
      reason: 'dismissed',
    };
  }

  const notice = buildNotice({ local, remote });
  return {
    ok: true,
    checked: true,
    updateAvailable: true,
    local,
    remote,
    notice: opts.hook ? notice : undefined,
    message: `Update available: v${local} → v${remote}`,
  };
}

export function writeLocalVersion(root, version) {
  const loop = loopDir(root);
  mkdirSync(loop, { recursive: true });
  writeFileSync(join(loop, 'kit-version'), `${String(version).trim()}\n`, 'utf8');
}
