/** Ultime N azioni agent — pannello compatto. */

const MAX = 3;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function actionKey(action) {
  return action.callId ?? `${action.type}:${action.label}:${action.detail}`;
}

export class ActivityFeed {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    /** @type {Map<string, object>} */
    this.items = new Map();
    /** @type {string[]} */
    this.order = [];
  }

  clear() {
    this.items.clear();
    this.order = [];
    this.#render();
  }

  /** @param {object} action */
  push(action) {
    const key = actionKey(action);
    const existing = this.items.get(key);

    if (existing) {
      Object.assign(existing, action);
    } else {
      this.items.set(key, { ...action, key });
      this.order.unshift(key);
      while (this.order.length > MAX) {
        const drop = this.order.pop();
        if (drop) this.items.delete(drop);
      }
    }

    this.#render();
  }

  /** @param {object} chunk */
  fromChunk(chunk) {
    if (chunk.kind === 'tool') {
      this.push({
        callId: chunk.callId,
        type: chunk.label?.toLowerCase() ?? 'tool',
        label: chunk.label ?? 'Tool',
        detail: chunk.detail ?? '',
        status: chunk.status === 'done' ? 'done' : 'running',
      });
      return;
    }
    if (chunk.kind === 'status') {
      this.push({
        type: 'status',
        label: chunk.text ?? 'Running',
        detail: '',
        status: 'running',
      });
    }
    if (chunk.kind === 'error') {
      this.push({
        type: 'error',
        label: chunk.text ?? 'Errore',
        detail: '',
        status: 'error',
      });
    }
  }

  finish(code, { empty = false } = {}) {
    if (code === 0 && empty) {
      this.push({
        type: 'status',
        label: 'Nessuna attività — riprova',
        detail: '',
        status: 'error',
      });
      return;
    }
    this.push({
      type: 'status',
      label: code === 0 ? 'Completato' : `Terminato (exit ${code})`,
      detail: '',
      status: code === 0 ? 'done' : 'error',
    });
  }

  exportState() {
    return {
      items: [...this.items.entries()],
      order: [...this.order],
    };
  }

  /** @param {{ items?: [string, object][]; order?: string[] } | null | undefined} saved */
  importState(saved) {
    if (!saved?.order?.length) {
      this.clear();
      return;
    }
    this.items = new Map(saved.items);
    this.order = [...saved.order];
    this.#render();
  }

  showPlaceholder(label) {
    this.items.clear();
    this.order = [];
    this.root.innerHTML = `<div class="activity-empty">${escapeHtml(label)}</div>`;
  }

  #render() {
    const keys = this.order.slice(0, MAX);
    if (keys.length === 0) {
      this.root.innerHTML = `<div class="activity-empty">Nessuna attività</div>`;
      return;
    }

    this.root.innerHTML = keys
      .map((key) => {
        const a = this.items.get(key);
        if (!a) return '';
        const statusClass =
          a.status === 'running'
            ? 'activity-item--running'
            : a.status === 'error'
              ? 'activity-item--error'
              : 'activity-item--done';
        const detail = a.detail
          ? `<span class="activity-detail">${escapeHtml(a.detail)}</span>`
          : '';
        return `
          <div class="activity-item ${statusClass}">
            <span class="activity-dot"></span>
            <span class="activity-label">${escapeHtml(a.label)}</span>
            ${detail}
          </div>`;
      })
      .join('');
  }
}
