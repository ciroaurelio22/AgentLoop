import { existsSync, readFileSync, readdirSync, watch } from 'node:fs';
import { join, resolve } from 'node:path';
import { loopDir as resolveLoopDir } from './repo-utils.mjs';
import { attachPrStatus } from './pr-status.mjs';

/** @typedef {{ write: (chunk: string) => void; end: () => void }} SseClient */

const STATUS_ORDER = {
  in_progress: 0,
  pending: 1,
  draft: 2,
  blocked: 3,
  done: 4,
};

function titleFromProgramFile(programPath) {
  try {
    const head = readFileSync(programPath, 'utf8').split('\n')[0] ?? '';
    const m = head.match(/^#\s*TASK-\d+\s*[—–-]\s*(.+)$/i);
    return m?.[1]?.trim() || '(untitled)';
  } catch {
    return '(untitled)';
  }
}

/** @param {string | null} repoRoot */
export function readTaskSnapshot(repoRoot) {
  if (!repoRoot) {
    return { activeTaskId: null, counts: {}, tasks: [], autostart: false, noWorkspace: true };
  }

  const root = resolve(repoRoot);
  const loopDir = resolveLoopDir(root);
  const queuePath = join(loopDir, 'queue.json');
  const statePath = join(loopDir, 'state.json');
  const autostartPath = join(loopDir, 'autostart');
  const tasksDir = join(root, 'specs', 'agent-tasks');
  const autostart = existsSync(autostartPath);

  let activeTaskId = null;
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      activeTaskId = state.activeTaskId ?? null;
    } catch {
      /* ignore */
    }
  }

  /** @type {object[]} */
  let tasks = [];

  if (existsSync(queuePath)) {
    try {
      const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
      tasks = (queue.tasks ?? []).map((t) => ({
        id: String(t.id ?? '').toUpperCase(),
        title: String(t.title ?? '').trim() || '(untitled)',
        status: String(t.status ?? 'pending'),
        priority: Number(t.priority ?? 100),
        program: t.program ?? `specs/agent-tasks/${t.id}.md`,
        branchSlug: t.branchSlug ?? null,
        createdAt: t.createdAt ?? null,
      }));
    } catch {
      tasks = [];
    }
  }

  const queuedIds = new Set(tasks.map((t) => t.id));
  if (existsSync(tasksDir)) {
    for (const name of readdirSync(tasksDir)) {
      const m = /^TASK-(\d+)\.md$/i.exec(name);
      if (!m) continue;
      const id = `TASK-${m[1].padStart(3, '0')}`;
      if (queuedIds.has(id)) continue;
      const programPath = join(tasksDir, name);
      tasks.push({
        id,
        title: titleFromProgramFile(programPath),
        status: 'draft',
        priority: 999,
        program: `specs/agent-tasks/${name}`,
        createdAt: null,
      });
    }
  }

  tasks.sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 9;
    const sb = STATUS_ORDER[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    if (a.status === 'pending' && b.status === 'pending') {
      return a.priority - b.priority;
    }
    return a.id.localeCompare(b.id);
  });

  const counts = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return { activeTaskId, counts, tasks, autostart, noWorkspace: false };
}

export class QueueWatcher {
  constructor() {
    /** @type {string | null} */
    this.repoRoot = null;
    /** @type {import('node:fs').FSWatcher | null} */
    this.watcher = null;
    /** @type {Set<SseClient>} */
    this.clients = new Set();
    this.debounceTimer = null;
  }

  /** @param {string | null} repoRoot */
  setRepo(repoRoot) {
    const next = repoRoot ? resolve(repoRoot) : null;
    const changed = this.repoRoot !== next;
    this.repoRoot = next;
    if (changed || !this.watcher) {
      this.#restartWatch();
    }
    this.#broadcast();
  }

  /** @param {SseClient} client */
  subscribe(client) {
    this.clients.add(client);
    this.#sendTo(client);
    return () => {
      this.clients.delete(client);
    };
  }

  #restartWatch() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (!this.repoRoot) return;

    const loopDir = resolveLoopDir(this.repoRoot);
    if (!existsSync(loopDir)) return;

    try {
      this.watcher = watch(loopDir, { persistent: false }, (_event, filename) => {
        if (
          filename &&
          !['queue.json', 'state.json', 'autostart'].includes(filename)
        ) {
          return;
        }
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.#broadcast(), 100);
      });
    } catch {
      /* loop dir missing mid-session */
    }
  }

  notify() {
    this.#broadcast();
  }

  #broadcast() {
    for (const client of this.clients) this.#sendTo(client);
  }

  /** @param {SseClient} client */
  #sendTo(client) {
    void this.#sendToAsync(client);
  }

  /** @param {SseClient} client */
  async #sendToAsync(client) {
    let snapshot = readTaskSnapshot(this.repoRoot);
    if (this.repoRoot) {
      snapshot = await attachPrStatus(this.repoRoot, snapshot);
    }
    const payload = JSON.stringify(snapshot);
    client.write(`event: tasks\ndata: ${payload}\n\n`);
  }
}
