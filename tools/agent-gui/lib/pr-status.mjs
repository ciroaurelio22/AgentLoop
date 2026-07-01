import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { loopDir as resolveLoopDir } from './repo-utils.mjs';

/** @typedef {{ number: number; url: string; state: 'OPEN' | 'MERGED' | 'CLOSED' }} TaskPr */

const CACHE_TTL_MS = 45_000;

/** @type {{ repo: string; at: number; byBranch: Map<string, TaskPr> } | null} */
let cache = null;

function runCommand(cmd, args, cwd) {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, args, {
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
    child.on('close', (code) => resolveRun({ code: code ?? 1, out: out.trim() }));
    child.on('error', () => resolveRun({ code: 127, out: '' }));
  });
}

/** @param {string} repoRoot */
function readQueue(repoRoot) {
  const queuePath = join(resolveLoopDir(resolve(repoRoot)), 'queue.json');
  if (!existsSync(queuePath)) return null;
  try {
    return JSON.parse(readFileSync(queuePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {object | null} queue
 * @param {string} taskId
 * @param {string | null | undefined} branchSlug
 */
function branchNameForTask(queue, taskId, branchSlug) {
  const prefix = queue?.defaults?.branchPrefix ?? 'agent';
  const suffix = queue?.defaults?.branchSuffix ?? '';
  const slug = branchSlug ?? taskId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return suffix ? `${prefix}/${slug}-${suffix}` : `${prefix}/${slug}`;
}

/**
 * @param {string} repoRoot
 * @param {object[]} tasks
 * @returns {Map<string, string>}
 */
function taskBranchMap(repoRoot, tasks) {
  const queue = readQueue(repoRoot);
  /** @type {Map<string, string>} */
  const byTaskId = new Map();
  const queueById = new Map((queue?.tasks ?? []).map((t) => [String(t.id ?? '').toUpperCase(), t]));

  for (const task of tasks) {
    const id = String(task.id ?? '').toUpperCase();
    if (!id) continue;
    const entry = queueById.get(id);
    byTaskId.set(id, branchNameForTask(queue, id, entry?.branchSlug ?? task.branchSlug));
  }
  return byTaskId;
}

/**
 * @param {string} repoRoot
 * @returns {Promise<Map<string, TaskPr>>}
 */
async function fetchPrsByBranch(repoRoot) {
  const root = resolve(repoRoot);
  const now = Date.now();
  if (cache && cache.repo === root && now - cache.at < CACHE_TTL_MS) {
    return cache.byBranch;
  }

  /** @type {Map<string, TaskPr>} */
  const byBranch = new Map();

  const ghCheck = await runCommand('gh', ['--version'], root);
  if (ghCheck.code !== 0) {
    cache = { repo: root, at: now, byBranch };
    return byBranch;
  }

  const { code, out } = await runCommand(
    'gh',
    ['pr', 'list', '--state', 'all', '--limit', '200', '--json', 'number,url,state,headRefName'],
    root,
  );

  if (code === 0 && out) {
    try {
      /** @type {{ number: number; url: string; state: string; headRefName: string }[]} */
      const rows = JSON.parse(out);
      for (const row of rows) {
        const branch = String(row.headRefName ?? '').trim();
        if (!branch || byBranch.has(branch)) continue;
        const state = String(row.state ?? '').toUpperCase();
        if (state !== 'OPEN' && state !== 'MERGED' && state !== 'CLOSED') continue;
        byBranch.set(branch, {
          number: Number(row.number),
          url: String(row.url ?? ''),
          state,
        });
      }
    } catch {
      /* ignore parse errors */
    }
  }

  cache = { repo: root, at: now, byBranch };
  return byBranch;
}

/**
 * @param {string | null} repoRoot
 * @param {object} snapshot
 */
export async function attachPrStatus(repoRoot, snapshot) {
  if (!repoRoot || snapshot.noWorkspace) return snapshot;

  const tasks = snapshot.tasks ?? [];
  if (tasks.length === 0) return snapshot;

  const branches = taskBranchMap(repoRoot, tasks);
  const prByBranch = await fetchPrsByBranch(repoRoot);

  snapshot.tasks = tasks.map((task) => {
    const id = String(task.id ?? '').toUpperCase();
    const branch = branches.get(id);
    const pr = branch ? (prByBranch.get(branch) ?? null) : null;
    return { ...task, branch, pr };
  });

  return snapshot;
}

/** Clear cached PR data (e.g. after repo switch). */
export function clearPrStatusCache() {
  cache = null;
}
