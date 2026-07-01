const STATUS_LABEL = {
  pending: 'Pending',
  in_progress: 'Running',
  done: 'Done',
  blocked: 'Blocked',
  draft: 'Draft',
};

const DELETABLE = new Set(['pending', 'draft']);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderPrLine(pr) {
  if (!pr?.number) return '';
  const n = escapeHtml(String(pr.number));
  if (pr.state === 'OPEN' && pr.url) {
    return `<a class="task-item-pr task-item-pr--open" href="${escapeHtml(pr.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">PR #${n}</a>`;
  }
  if (pr.state === 'MERGED') {
    if (pr.url) {
      return `<a class="task-item-pr task-item-pr--merged" href="${escapeHtml(pr.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Merged #${n}</a>`;
    }
    return `<span class="task-item-pr task-item-pr--merged">Merged #${n}</span>`;
  }
  if (pr.state === 'CLOSED') {
    return `<span class="task-item-pr task-item-pr--closed">PR closed</span>`;
  }
  return '';
}

export class TaskSidebar {
  /**
   * @param {HTMLElement} root
   * @param {{ onSelect: (taskId: string) => void; onDelete?: (taskId: string) => void }} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.onSelect = opts.onSelect;
    this.onDelete = opts.onDelete;
    /** @type {string | null} */
    this.selectedId = null;
    /** @type {string | null} */
    this.activeTaskId = null;
    this.root.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-id]');
      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.deleteId;
        if (id) this.onDelete?.(id);
        return;
      }
      const btn = e.target.closest('[data-task-id]');
      if (!btn) return;
      const id = btn.dataset.taskId;
      if (id) this.onSelect(id);
    });
  }

  /** @param {{ activeTaskId?: string | null; counts?: Record<string, number>; tasks?: object[] }} snapshot */
  render(snapshot) {
    this.activeTaskId = snapshot.activeTaskId ?? null;
    const tasks = snapshot.tasks ?? [];
    const counts = snapshot.counts ?? {};

    const summary = Object.entries(counts)
      .map(([k, n]) => `${n} ${STATUS_LABEL[k] ?? k}`)
      .join(' · ');

    if (tasks.length === 0) {
      const emptyMsg = snapshot.noWorkspace
        ? 'Set workspace path and click Apply'
        : 'Queue is empty';
      const summary = snapshot.noWorkspace ? 'No workspace' : 'No tasks';
      this.root.innerHTML = `
        <div class="sidebar-summary">${escapeHtml(summary)}</div>
        <div class="task-list-empty">${escapeHtml(emptyMsg)}</div>`;
      return;
    }

    const items = tasks
      .map((t) => {
        const id = t.id;
        const status = t.status ?? 'pending';
        const isSelected = id === this.selectedId;
        const isActive = id === this.activeTaskId;
        const classes = [
          'task-item',
          isSelected ? 'task-item--selected' : '',
          isActive ? 'task-item--active' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const prLine = renderPrLine(t.pr);
        const deleteBtn = DELETABLE.has(status)
          ? `<button type="button" class="task-item-delete" data-delete-id="${escapeHtml(id)}" title="Elimina task" aria-label="Elimina ${escapeHtml(id)}">×</button>`
          : '';
        return `
          <div class="task-item-wrap">
            <button type="button" class="${classes}" data-task-id="${escapeHtml(id)}" data-status="${escapeHtml(status)}">
              <span class="task-item-top">
                <span class="task-item-id">${escapeHtml(id)}</span>
                <span class="task-item-status-col">
                  <span class="task-status task-status--${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] ?? status)}</span>
                  ${prLine}
                </span>
              </span>
              <span class="task-item-title">${escapeHtml(t.title)}</span>
            </button>
            ${deleteBtn}
          </div>`;
      })
      .join('');

    this.root.innerHTML = `
      <div class="sidebar-summary">${escapeHtml(summary || `${tasks.length} tasks`)}</div>
      <div class="task-list-items">${items}</div>`;

    if (this.selectedId) this.select(this.selectedId);
  }

  select(taskId) {
    this.selectedId = taskId?.toUpperCase() ?? null;
    for (const el of this.root.querySelectorAll('.task-item')) {
      el.classList.toggle('task-item--selected', el.dataset.taskId === this.selectedId);
    }
  }
}
