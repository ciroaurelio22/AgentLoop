import { existsSync, readFileSync, watch } from 'node:fs';
import { join } from 'node:path';
import { TASK_ID_RE } from './repo-utils.mjs';

/** @typedef {{ write: (chunk: string) => void; end: () => void }} SseClient */

export class ProgramWatcher {
  constructor() {
    /** @type {import('node:fs').FSWatcher | null} */
    this.watcher = null;
    /** @type {string | null} */
    this.filePath = null;
    /** @type {string | null} */
    this.taskId = null;
    /** @type {Set<SseClient>} */
    this.clients = new Set();
    this.suppressUntil = 0;
    this.debounceTimer = null;
  }

  /** @param {string | null} repoRoot */
  setTask(repoRoot, taskId) {
    if (!repoRoot || !TASK_ID_RE.test(taskId)) {
      this.stopWatch();
      return;
    }
    const path = join(repoRoot, 'specs', 'agent-tasks', `${taskId.toUpperCase()}.md`);
    if (this.filePath === path && this.watcher) return;

    this.stopWatch();
    this.filePath = path;
    this.taskId = taskId.toUpperCase();

    if (!existsSync(path)) return;

    this.#startWatch();
  }

  #startWatch() {
    if (!this.filePath || this.watcher) return;
    this.watcher = watch(this.filePath, { persistent: false }, () => {
      if (Date.now() < this.suppressUntil) return;
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.#broadcast(), 120);
    });
  }

  markLocalWrite() {
    this.suppressUntil = Date.now() + 600;
  }

  /** @param {SseClient} client */
  subscribe(client) {
    this.clients.add(client);
    if (this.filePath && !this.watcher) this.#startWatch();
    this.#sendTo(client);
    return () => {
      this.clients.delete(client);
      if (this.clients.size === 0) this.stopWatch();
    };
  }

  stopWatch() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  #broadcast() {
    for (const client of this.clients) this.#sendTo(client);
  }

  /** @param {SseClient} client */
  #sendTo(client) {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const program = readFileSync(this.filePath, 'utf8');
      const payload = JSON.stringify({
        taskId: this.taskId,
        program,
        mtime: Date.now(),
      });
      client.write(`event: program\ndata: ${payload}\n\n`);
    } catch {
      /* file mid-write */
    }
  }
}
