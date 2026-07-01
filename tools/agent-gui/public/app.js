import { ActivityFeed } from './activity-feed.js';
import { TaskSidebar } from './task-sidebar.js';
import { renderProgramMarkdown } from './program-markdown.mjs';

const $ = (sel) => document.querySelector(sel);

const els = {
  repoPath: $('#repo-path'),
  setupGate: $('#setup-gate'),
  setupChecklist: $('#setup-checklist'),
  setupWorkspace: $('#setup-workspace'),
  setupRepoPath: $('#setup-repo-path'),
  btnSetupApply: $('#btn-setup-apply'),
  btnSetupRecheck: $('#btn-setup-recheck'),
  btnEnableAutostart: $('#btn-enable-autostart'),
  taskId: $('#task-id'),
  taskTitle: $('#task-title'),
  btnCreate: $('#btn-create'),
  btnSave: $('#btn-save'),
  btnVerify: $('#btn-verify'),
  btnProgramAi: $('#btn-program-ai'),
  btnMore: $('#btn-more'),
  moreMenu: $('#more-menu'),
  agentBackend: $('#agent-backend'),
  agentModel: $('#agent-model'),
  taskList: $('#task-list'),
  btnSidebarNew: $('#btn-sidebar-new'),
  activityFeed: $('#activity-feed'),
  programFile: $('#program-file'),
  programSync: $('#program-sync'),
  programBody: $('.program-body'),
  programPreview: $('#program-preview'),
  programEditor: $('#program-editor'),
  btnProgramEdit: $('#btn-program-edit'),
  btnProgramApply: $('#btn-program-apply'),
  descDialog: $('#desc-dialog'),
  descForm: $('#desc-form'),
  descHeading: $('#desc-heading'),
  descSubtitle: $('#desc-subtitle'),
  descText: $('#desc-text'),
  descCancel: $('#desc-cancel'),
  descSubmit: $('#desc-submit'),
  agentAskDialog: $('#agent-ask-dialog'),
  agentAskForm: $('#agent-ask-form'),
  agentAskQuestion: $('#agent-ask-question'),
  agentAskOptions: $('#agent-ask-options'),
  agentAskText: $('#agent-ask-text'),
  agentAskCancel: $('#agent-ask-cancel'),
  agentAskSubmit: $('#agent-ask-submit'),
  toast: $('#toast'),
  bootOverlay: $('#boot-overlay'),
  bootMessage: $('#boot-message'),
};

const state = {
  taskId: 'TASK-001',
  activeProgramId: null,
  agentRunning: false,
  /** @type {((value: boolean) => void) | null} */
  agentAskResolve: null,
  descResolve: null,
  diskContent: '',
  dirty: false,
  agentSettingsReady: false,
  savingAgentSettings: false,
  loadingAgentModels: false,
  programEditing: false,
  /** @type {{ id: string; question: string; options: string[]; allowMultiple: boolean } | null} */
  agentAskPayload: null,
  selectedModel: '',
  /** @type {object[] | null} */
  installedProviders: null,
};

let toastTimer = null;
let watchSource = null;
let tasksWatchSource = null;
/** @type {ActivityFeed | null} */
let activityFeed = null;
/** @type {TaskSidebar | null} */
let taskSidebar = null;
/** @type {object[]} */
let lastTaskSnapshot = [];
let loadTaskSeq = 0;
/** @type {string | null} */
let currentViewTaskId = null;
/** @type {Map<string, { items: [string, object][]; order: string[] }>} */
const activityByTask = new Map();

const STATUS_LABEL = {
  pending: 'Pending',
  in_progress: 'Running',
  done: 'Done',
  blocked: 'Blocked',
  draft: 'Draft',
};

function persistActivity(taskId) {
  if (!taskId || !activityFeed) return;
  const saved = activityFeed.exportState();
  if (saved.order.length > 0) {
    activityByTask.set(taskId, saved);
  }
}

function showTaskActivity(taskId, meta) {
  activityFeed = activityFeed ?? new ActivityFeed(els.activityFeed);
  const saved = activityByTask.get(taskId);
  if (saved?.order?.length) {
    activityFeed.importState(saved);
    return;
  }
  const status = STATUS_LABEL[meta?.status ?? 'pending'] ?? meta?.status ?? 'Pending';
  activityFeed.showPlaceholder(`${taskId} · ${status}`);
}

function toast(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 3500);
}

function getRepoPath() {
  return (els.repoPath?.dataset.path ?? '').trim();
}

/** @param {string | null | undefined} path */
function setRepoPath(path) {
  const value = (path ?? '').trim();
  if (!els.repoPath) return;
  els.repoPath.dataset.path = value;
  els.repoPath.textContent = value || 'Nessun workspace';
  els.repoPath.title = value;
  els.repoPath.classList.toggle('workspace-path--empty', !value);
}

function setBootMessage(message) {
  if (els.bootMessage) els.bootMessage.textContent = message;
}

/** @param {() => Promise<unknown>} fn */
async function bootStep(message, fn) {
  setBootMessage(message);
  return fn();
}

function hideBootLoader() {
  document.body.classList.remove('boot-loading');
  els.bootOverlay?.setAttribute('aria-busy', 'false');
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function setBusy(busy) {
  state.agentRunning = busy;
  els.btnCreate.disabled = busy;
  els.btnSave.disabled = busy;
  els.btnVerify.disabled = busy;
  els.btnProgramAi.disabled = busy;
  els.btnProgramEdit.disabled = busy;
  els.btnProgramApply.disabled = busy;
  els.btnSidebarNew.disabled = busy;
  setAgentSettingsEnabled(Boolean(getRepoPath()) && !busy);
}

function setCreateVisible(show) {
  els.btnCreate.classList.toggle('hidden', !show);
}

async function previewCreate() {
  const title = els.taskTitle.value.trim();
  if (!title) {
    toast('Enter a title', 'warning');
    return;
  }
  const taskId = state.taskId;
  try {
    const data = await api(
      `/api/template?taskId=${encodeURIComponent(taskId)}&title=${encodeURIComponent(title)}`,
    );
    applyProgramContent(data.program);
    state.activeProgramId = taskId;
    state.diskContent = '';
    state.dirty = true;
    els.programFile.textContent = `${taskId}.md`;
    setSyncBadge('draft');
    toast('Template loaded — save when ready', 'success');
    taskSidebar?.select(null);
    if (watchSource) {
      watchSource.close();
      watchSource = null;
    }
    setCreateVisible(false);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function ensureProgramOnDisk(taskId, title) {
  const id = taskId.toUpperCase();
  try {
    await api(`/api/program/${id}`);
    return { taskId: id, title: title || id };
  } catch {
    if (!title) {
      toast('Enter a title', 'warning');
      return null;
    }
    try {
      await api('/api/tasks/create', {
        method: 'POST',
        body: JSON.stringify({ taskId: id, title }),
      });
      if (els.programEditor.value.trim()) {
        await api(`/api/program/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ program: els.programEditor.value }),
        });
      }
      const data = await refreshState();
      state.taskId = data.nextTaskId;
      els.taskId.textContent = data.nextTaskId;
      setActiveProgram(id);
      taskSidebar?.select(id);
      await loadTaskList();
      setCreateVisible(false);
      return { taskId: id, title };
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  }
}

async function deleteTask(taskId) {
  const id = taskId.toUpperCase();
  const meta = lastTaskSnapshot.find((t) => t.id === id);
  const label = meta?.title ? `${id} · ${meta.title}` : id;
  if (!confirm(`Eliminare ${label}?`)) return;

  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    activityByTask.delete(id);
    if (state.activeProgramId === id) {
      await prepareNewTask();
    }
    await loadTaskList();
    toast(`Eliminato ${id}`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function ensureTaskPersisted() {
  return ensureProgramOnDisk(state.taskId, els.taskTitle.value.trim());
}

function setSetupBlocked(blocked) {
  document.body.classList.toggle('setup-blocked', blocked);
  els.setupGate?.classList.toggle('hidden', !blocked);
}

function renderSetupChecklist(setup) {
  if (!els.setupChecklist) return;

  els.setupChecklist.innerHTML = (setup.checks ?? [])
    .map((check) => {
      const optional = !check.required;
      const statusClass = check.ok ? 'setup-item--ok' : optional ? 'setup-item--optional-warn' : 'setup-item--fail';
      const badge = check.ok ? 'OK' : optional ? 'Optional' : 'Required';
      return `
        <li class="setup-item ${statusClass}${optional ? ' setup-item--optional' : ''}">
          <div class="setup-item-head">
            <span class="setup-item-label">${escapeHtml(check.label)}</span>
            <span class="setup-item-badge">${badge}</span>
          </div>
          <p class="setup-item-detail">${escapeHtml(check.detail ?? '')}</p>
        </li>`;
    })
    .join('');

  const workspaceCheck = setup.checks?.find((c) => c.id === 'workspace');
  const autostartCheck = setup.checks?.find((c) => c.id === 'autostart');
  els.setupWorkspace?.classList.toggle('hidden', Boolean(workspaceCheck?.ok));
  els.btnEnableAutostart?.classList.toggle('hidden', Boolean(autostartCheck?.ok));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function refreshSetup() {
  try {
    const setup = await api('/api/setup');
    state.installedProviders = setup.installedProviders ?? state.installedProviders;
    renderSetupChecklist(setup);
    setSetupBlocked(!setup.ready);
    if (setup.installedProviders?.length) {
      applyProviderOptions(setup.installedProviders, els.agentBackend.value);
    }
    if (els.setupRepoPath && !setup.checks?.find((c) => c.id === 'workspace')?.ok) {
      if (getRepoPath()) els.setupRepoPath.value = getRepoPath();
    }
    return setup;
  } catch {
    setSetupBlocked(true);
    return null;
  }
}

function setStatus(_text, _pillState = 'idle') {
  /* status pill removed from UI */
}

function setSyncBadge(mode) {
  els.programSync.dataset.state = mode;
  const labels = {
    live: 'sync',
    dirty: 'edited',
    syncing: 'sync…',
    draft: 'draft',
    idle: 'sync',
  };
  els.programSync.textContent = labels[mode] ?? 'sync';
}

function parseTaskIdFromEditor() {
  const head = els.programEditor.value.slice(0, 400);
  const m = head.match(/^#\s*(TASK-\d+)/im);
  return m ? m[1].toUpperCase() : state.activeProgramId ?? state.taskId;
}

function markDirty() {
  state.dirty = els.programEditor.value !== state.diskContent;
  setSyncBadge(state.dirty ? 'dirty' : 'live');
}

function renderProgramPreview(content = els.programEditor.value) {
  if (!els.programPreview) return;
  els.programPreview.innerHTML = renderProgramMarkdown(content);
}

function setProgramViewMode(editing) {
  state.programEditing = editing;
  els.programBody?.classList.toggle('program-body--edit', editing);
  els.btnProgramEdit?.classList.toggle('hidden', editing);
  els.btnProgramApply?.classList.toggle('hidden', !editing);
  if (editing) {
    els.programEditor?.focus();
  } else {
    renderProgramPreview();
  }
}

function enterProgramEdit() {
  setProgramViewMode(true);
}

function applyProgramEdits() {
  markDirty();
  setProgramViewMode(false);
}

function applyProgramContent(program, { fromDisk = false } = {}) {
  if (fromDisk && (state.dirty || state.programEditing)) return false;
  els.programEditor.value = program;
  state.diskContent = program;
  state.dirty = false;
  setSyncBadge('live');
  if (state.programEditing) setProgramViewMode(false);
  else renderProgramPreview(program);
  return true;
}

async function syncWorkspace(path) {
  const trimmed = path?.trim();
  if (!trimmed) return false;
  try {
    await api('/api/repo', { method: 'POST', body: JSON.stringify({ path: trimmed }) });
    return true;
  } catch {
    return false;
  }
}

async function loadTaskList() {
  try {
    const tasks = await api('/api/tasks');
    lastTaskSnapshot = tasks.tasks ?? [];
    taskSidebar?.render(tasks);
    return tasks;
  } catch {
    taskSidebar?.render({ tasks: [], autostart: false, noWorkspace: true });
    return null;
  }
}

function connectTasksWatch() {
  if (tasksWatchSource) {
    tasksWatchSource.close();
    tasksWatchSource = null;
  }

  tasksWatchSource = new EventSource('/api/watch/tasks');
  tasksWatchSource.addEventListener('tasks', (ev) => {
    try {
      const snapshot = JSON.parse(ev.data);
      lastTaskSnapshot = snapshot.tasks ?? [];
      taskSidebar?.render(snapshot);
    } catch {
      /* ignore */
    }
  });
  tasksWatchSource.onerror = () => {
    /* reconnect handled by browser */
  };
}

async function loadTask(taskId) {
  const id = taskId.toUpperCase();
  const seq = ++loadTaskSeq;

  if (currentViewTaskId && currentViewTaskId !== id) {
    persistActivity(currentViewTaskId);
  }
  currentViewTaskId = id;

  taskSidebar?.select(id);

  const meta = lastTaskSnapshot.find((t) => t.id === id);
  if (meta?.title) els.taskTitle.value = meta.title;
  els.taskId.textContent = id;
  showTaskActivity(id, meta);

  state.dirty = false;

  try {
    const data = await api(`/api/program/${id}`);
    if (seq !== loadTaskSeq) return;
    applyProgramContent(data.program);
    setActiveProgram(id);
  } catch {
    if (seq !== loadTaskSeq) return;
    applyProgramContent('');
    state.diskContent = '';
    state.activeProgramId = id;
    els.programFile.textContent = `${id}.md`;
    setSyncBadge('draft');
    connectProgramWatch(id);
    setCreateVisible(false);
  }
}

function setActiveProgram(taskId) {
  state.activeProgramId = taskId.toUpperCase();
  els.programFile.textContent = `${state.activeProgramId}.md`;
  connectProgramWatch(state.activeProgramId);
  setCreateVisible(false);
}

function connectProgramWatch(taskId) {
  if (watchSource) {
    watchSource.close();
    watchSource = null;
  }
  if (!taskId) return;

  watchSource = new EventSource(`/api/watch/program?taskId=${encodeURIComponent(taskId)}`);
  watchSource.addEventListener('program', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.program === undefined) return;
      if (data.taskId && data.taskId.toUpperCase() !== state.activeProgramId) return;
      setSyncBadge('syncing');
      const applied = applyProgramContent(data.program, { fromDisk: true });
      if (applied) {
        requestAnimationFrame(() => setSyncBadge('live'));
      }
    } catch {
      /* ignore */
    }
  });
  watchSource.onerror = () => {
    setSyncBadge('idle');
  };
}

const PROVIDER_LABELS = {
  cursor: 'Cursor',
  claude: 'Claude',
  codex: 'Codex',
};

function applyProviderOptions(providers, selectedBackend) {
  if (!providers?.length) return { backend: selectedBackend ?? 'cursor', changed: false };

  for (const option of els.agentBackend.options) {
    const meta = providers.find((p) => p.id === option.value);
    const installed = Boolean(meta?.installed);
    option.disabled = !installed;
    const label = PROVIDER_LABELS[option.value] ?? option.value;
    option.textContent = installed ? label : `${label} (not installed)`;
  }

  let backend = selectedBackend ?? els.agentBackend.value ?? 'cursor';
  const current = providers.find((p) => p.id === backend);
  let changed = false;
  if (!current?.installed) {
    const firstInstalled = providers.find((p) => p.installed);
    if (firstInstalled) {
      backend = firstInstalled.id;
      changed = backend !== (selectedBackend ?? els.agentBackend.value);
    }
  }

  els.agentBackend.value = backend;
  return { backend, changed };
}

function setAgentSettingsEnabled(enabled) {
  const hasInstalledProvider = state.installedProviders?.some((p) => p.installed) ?? true;
  const allow = enabled && hasInstalledProvider;
  els.agentBackend.disabled = !allow || state.agentRunning;
  els.agentModel.disabled = !enabled || state.agentRunning || state.loadingAgentModels;
}

function renderModelSelect(models = [], selectedId = '', { loading = false, error = '' } = {}) {
  if (loading) {
    els.agentModel.innerHTML = '<option value="">Loading models…</option>';
    els.agentModel.value = '';
    return;
  }

  const seen = new Set();
  /** @type {{ id: string; label: string }[]} */
  const items = [];
  for (const model of models) {
    const id = String(model.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, label: String(model.label ?? id).trim() || id });
  }

  if (selectedId && !seen.has(selectedId)) {
    items.unshift({ id: selectedId, label: `${selectedId} (saved)` });
  }

  if (!items.length) {
    const message = error || 'No models available';
    els.agentModel.innerHTML = `<option value="">${escapeHtml(message)}</option>`;
    els.agentModel.value = '';
    return;
  }

  els.agentModel.innerHTML = items
    .map(
      (model) =>
        `<option value="${escapeHtml(model.id)}">${escapeHtml(model.label)}</option>`,
    )
    .join('');
  els.agentModel.value = selectedId && [...els.agentModel.options].some((o) => o.value === selectedId)
    ? selectedId
    : items[0].id;
}

async function loadAgentModels({ backend, selectedModel } = {}) {
  if (!getRepoPath()) {
    renderModelSelect([], '', { error: 'Select workspace first' });
    return null;
  }

  const modelIdHint = selectedModel ?? state.selectedModel;
  state.loadingAgentModels = true;
  els.agentModel.disabled = true;

  try {
    const params = new URLSearchParams();
    if (backend) params.set('backend', backend);
    const query = params.toString();
    const data = await api(`/api/agent/models${query ? `?${query}` : ''}`);
    const modelId = modelIdHint ?? data.models?.[0]?.id ?? '';
    state.selectedModel = modelId;
    renderModelSelect(data.models ?? [], modelId, { error: data.error });
    return data;
  } catch (err) {
    renderModelSelect([], modelIdHint, { error: err.message });
    return null;
  } finally {
    state.loadingAgentModels = false;
    setAgentSettingsEnabled(Boolean(getRepoPath()) && !state.agentRunning);
  }
}

function applyAgentSettings(data) {
  if (!data) return { backend: 'cursor', changed: false };
  state.agentSettingsReady = Boolean(data.repoValid ?? data.backend);
  const resolved = applyProviderOptions(data.installedProviders, data.agentBackend ?? data.backend ?? 'cursor');
  state.selectedModel = data.model ?? '';
  setAgentSettingsEnabled(Boolean(data.repoValid ?? data.repo));
  return resolved;
}

async function saveAgentSettings(
  patch,
  { quiet = false, resetModelOnBackendChange = false, skipModelReload = false } = {},
) {
  if (state.savingAgentSettings || state.agentRunning) return null;
  state.savingAgentSettings = true;
  try {
    const data = await api('/api/agent/settings', {
      method: 'PUT',
      body: JSON.stringify({ ...patch, resetModelOnBackendChange }),
    });
    applyAgentSettings({
      repoValid: true,
      agentBackend: data.backend,
      model: data.model,
      installedProviders: state.installedProviders,
    });
    state.selectedModel = data.model;
    if (!skipModelReload) {
      void loadAgentModels({ backend: data.backend, selectedModel: data.model });
    }
    if (!quiet) toast('Agent settings saved', 'success');
    void refreshSetup();
    return data;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  } finally {
    state.savingAgentSettings = false;
  }
}

async function refreshState({ skipModels = false } = {}) {
  const data = await api('/api/state');
  if (data.repo) setRepoPath(data.repo);
  state.taskId = data.nextTaskId;
  els.taskId.textContent = data.nextTaskId;
  state.installedProviders = data.installedProviders ?? null;
  const resolved = applyAgentSettings(data);
  if (data.repoValid && resolved.changed) {
    await saveAgentSettings(
      { backend: resolved.backend, resetModelOnBackendChange: true },
      { quiet: true, skipModelReload: skipModels },
    );
    return refreshState({ skipModels });
  }
  if (data.repoValid) {
    const saved = data.model ?? state.selectedModel;
    if (saved) {
      renderModelSelect([{ id: saved, label: saved }], saved);
    }
    if (!skipModels) {
      void loadAgentModels({ backend: resolved.backend, selectedModel: saved });
    }
  } else {
    renderModelSelect([], '', { error: 'Select workspace first' });
  }
  if (data.agentRunning) {
    setBusy(true);
    setStatus('Running', 'running');
  }
  if (!data.repoValid && data.repo) {
    toast('Invalid workspace path', 'warning');
  }
  return data;
}

function askDescription({ heading, subtitle, ai = false }) {
  els.descHeading.textContent = heading;
  els.descSubtitle.textContent = subtitle;
  els.descText.value = '';
  els.descSubmit.classList.toggle('btn--ai', ai);
  els.descSubmit.classList.toggle('btn--primary', !ai);
  els.descDialog.showModal();
  els.descText.focus();
  return new Promise((resolve) => {
    state.descResolve = resolve;
  });
}

function renderAgentAskOptions({ options = [], allowMultiple = false } = {}) {
  if (!els.agentAskOptions) return;
  if (!options.length) {
    els.agentAskOptions.classList.add('hidden');
    els.agentAskOptions.innerHTML = '';
    els.agentAskText?.classList.remove('hidden');
    return;
  }

  els.agentAskOptions.classList.remove('hidden');
  const inputType = allowMultiple ? 'checkbox' : 'radio';
  const groupName = 'agent-ask-choice';
  els.agentAskOptions.innerHTML = options
    .map(
      (option, index) => `
        <label class="agent-ask-option">
          <input type="${inputType}" name="${groupName}" value="${escapeHtml(option)}" ${index === 0 && !allowMultiple ? 'checked' : ''} />
          <span>${escapeHtml(option)}</span>
        </label>`,
    )
    .join('');
}

function showAgentAskDialog(payload) {
  state.agentAskPayload = payload;
  if (els.agentAskQuestion) els.agentAskQuestion.textContent = payload.question;
  renderAgentAskOptions(payload);
  if (els.agentAskText) {
    els.agentAskText.value = '';
    els.agentAskText.placeholder = payload.options?.length
      ? 'Altri dettagli (opzionale)…'
      : 'Scrivi la tua risposta…';
  }
  els.agentAskDialog?.showModal();
  if (payload.options?.length && !payload.allowMultiple) {
    els.agentAskOptions?.querySelector('input')?.focus();
  } else {
    els.agentAskText?.focus();
  }
  return new Promise((resolve) => {
    state.agentAskResolve = resolve;
  });
}

function closeAgentAskDialog(result) {
  els.agentAskDialog?.close();
  state.agentAskPayload = null;
  state.agentAskResolve?.(result);
  state.agentAskResolve = null;
}

async function submitAgentAskAnswer() {
  const payload = state.agentAskPayload;
  if (!payload) return;

  /** @type {{ answer?: string; answers?: string[]; cancelled?: boolean }} */
  let body = {};

  if (payload.options?.length) {
    const selected = [
      ...els.agentAskOptions.querySelectorAll('input:checked'),
    ].map((input) => /** @type {HTMLInputElement} */ (input).value);
    const extra = els.agentAskText?.value.trim() ?? '';
    if (payload.allowMultiple) {
      const answers = [...selected];
      if (extra) answers.push(extra);
      if (!answers.length) {
        toast('Seleziona almeno un’opzione', 'warning');
        return;
      }
      body = { answers };
    } else if (selected.length) {
      body = { answer: selected[0] };
    } else if (extra) {
      body = { answer: extra };
    } else {
      toast('Seleziona un’opzione o scrivi una risposta', 'warning');
      return;
    }
  } else {
    const answer = els.agentAskText?.value.trim() ?? '';
    if (answer.length < 1) {
      toast('Scrivi una risposta', 'warning');
      return;
    }
    body = { answer };
  }

  try {
    await api(`/api/agent/ask/${encodeURIComponent(payload.id)}/answer`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    closeAgentAskDialog(true);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function cancelAgentAskAnswer() {
  const payload = state.agentAskPayload;
  if (!payload) {
    closeAgentAskDialog(false);
    return;
  }
  try {
    await api(`/api/agent/ask/${encodeURIComponent(payload.id)}/answer`, {
      method: 'POST',
      body: JSON.stringify({ cancelled: true }),
    });
  } catch {
    /* ignore */
  }
  closeAgentAskDialog(false);
}

async function prepareNewTask() {
  if (currentViewTaskId) persistActivity(currentViewTaskId);
  currentViewTaskId = null;
  await refreshState();
  els.taskTitle.value = '';
  els.programEditor.value = '';
  renderProgramPreview('');
  setProgramViewMode(false);
  state.diskContent = '';
  state.dirty = false;
  state.activeProgramId = null;
  els.programFile.textContent = '—';
  setSyncBadge('idle');
  taskSidebar?.select(null);
  activityFeed?.showPlaceholder('Select a task or create a new one');
  if (watchSource) {
    watchSource.close();
    watchSource = null;
  }
  els.taskTitle.focus();
  setCreateVisible(true);
}

async function createTask(quiet = false) {
  const taskId = state.taskId;
  const title = els.taskTitle.value.trim();
  if (!title) {
    toast('Enter a title', 'warning');
    return null;
  }
  try {
    const data = await api('/api/tasks/create', {
      method: 'POST',
      body: JSON.stringify({ taskId, title }),
    });
    state.taskId = data.nextTaskId;
    els.taskId.textContent = data.nextTaskId;
    applyProgramContent(data.program);
    setActiveProgram(data.taskId);
    taskSidebar?.select(data.taskId);
    if (!quiet) toast(`Created ${taskId}`, 'success');
    return { taskId: data.taskId, title, program: data.program };
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

async function saveProgram() {
  const taskId = parseTaskIdFromEditor();
  const title = els.taskTitle.value.trim();
  try {
    await api(`/api/program/${taskId}`);
  } catch {
    if (!title) {
      toast('Enter a title', 'warning');
      return;
    }
    await ensureTaskPersisted();
  }
  try {
    await api(`/api/program/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ program: els.programEditor.value }),
    });
    state.diskContent = els.programEditor.value;
    state.dirty = false;
    setSyncBadge('live');
    setProgramViewMode(false);
    setActiveProgram(taskId);
    await loadTaskList();
    toast('Saved', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function reloadProgram() {
  const taskId = parseTaskIdFromEditor();
  try {
    const data = await api(`/api/program/${taskId}`);
    applyProgramContent(data.program);
    setActiveProgram(taskId);
    toast('Reloaded', 'success');
  } catch (err) {
    toast(err.message, 'warning');
  }
}

async function verifyAcceptance() {
  await saveProgram();
  const taskId = parseTaskIdFromEditor();
  try {
    const data = await api('/api/acceptance', {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    });
    if (data.ok) toast('All criteria met', 'success');
    else toast(data.output ?? 'Criteria pending', 'warning');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function enableAutostart() {
  try {
    els.btnEnableAutostart.disabled = true;
    await api('/api/autostart', { method: 'POST', body: '{}' });
    await refreshState();
    await refreshSetup();
    toast('Autostart enabled', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    els.btnEnableAutostart.disabled = false;
  }
}

async function applyWorkspaceFromGate() {
  const path = els.setupRepoPath?.value.trim() || getRepoPath();
  if (!path) {
    toast('Enter workspace path', 'warning');
    return;
  }
  setRepoPath(path);
  const ok = await syncWorkspace(path);
  if (!ok) {
    toast('Invalid workspace path', 'error');
    return;
  }
  await refreshState();
  connectTasksWatch();
  void loadTaskList();
  void refreshSetup();
  toast('Workspace applied', 'success');
}

async function startAgent({ taskId, title, description }) {
  const id = taskId.toUpperCase();
  currentViewTaskId = id;
  taskSidebar?.select(id);
  els.taskId.textContent = id;

  activityFeed = new ActivityFeed(els.activityFeed);
  activityFeed.clear();
  activityFeed.push({ type: 'status', label: 'Starting agent…', status: 'running' });
  activityByTask.set(id, activityFeed.exportState());
  setActiveProgram(taskId);
  setBusy(true);
  setStatus('Running', 'running');

  const res = await fetch('/api/agent/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskId,
      title,
      description,
      currentProgram: els.programEditor.value,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    setBusy(false);
    setStatus('Error', 'error');
    toast(err.error ?? 'Failed to start agent', 'error');
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  let sawActivity = false;

  const handleEvent = (event, data) => {
    if (event === 'chunk') {
      if (['tool', 'session', 'assistant', 'meta'].includes(data.kind)) {
        sawActivity = true;
      }
      activityFeed?.fromChunk(data);
      activityByTask.set(id, activityFeed.exportState());
      setStatus('Running', 'running');
    } else if (event === 'ask') {
      sawActivity = true;
      activityFeed?.push({
        type: 'status',
        label: 'In attesa della tua risposta…',
        detail: data.question?.slice(0, 100) ?? '',
        status: 'running',
      });
      activityByTask.set(id, activityFeed.exportState());
      void showAgentAskDialog(data).then((ok) => {
        activityFeed?.push({
          type: 'status',
          label: ok ? 'Risposta inviata' : 'Domanda annullata',
          detail: '',
          status: ok ? 'done' : 'error',
        });
        activityByTask.set(id, activityFeed.exportState());
      });
    } else if (event === 'done') {
      const empty = data.code === 0 && !sawActivity;
      activityFeed?.finish(data.code, { empty });
      activityByTask.set(id, activityFeed.exportState());
      setBusy(false);
      if (data.code === 0 && !empty) {
        setStatus('Done', 'done');
        if (data.program) applyProgramContent(data.program, { fromDisk: !state.dirty });
        toast('Program ready — review and verify', 'success');
      } else if (data.code === 0 && empty) {
        setStatus('Empty run', 'error');
        toast('Agent terminato senza attività — riprova', 'warning');
      } else {
        setStatus(`Error ${data.code}`, 'error');
        toast('Agent failed', 'error');
      }
    } else if (event === 'error') {
      activityFeed?.fromChunk({ kind: 'error', text: data.message });
      toast(data.message ?? 'Agent error', 'error');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      let dataStr = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) dataStr = line.slice(6);
      }
      if (dataStr) {
        try {
          handleEvent(event, JSON.parse(dataStr));
        } catch {
          /* ignore */
        }
      }
    }
  }
}

async function createAndDraft() {
  const taskId = state.taskId;
  const title = els.taskTitle.value.trim();

  const description = await askDescription({
    heading: 'AI request',
    subtitle: title ? `${taskId} · ${title}` : taskId,
    ai: true,
  });
  if (!description) return;

  if (!title) {
    toast('Enter a task title first', 'warning');
    return;
  }

  const persisted = await ensureTaskPersisted();
  if (!persisted) return;

  await startAgent({ taskId: persisted.taskId, title: persisted.title, description });
}

async function draftExisting() {
  let taskId = parseTaskIdFromEditor();
  let title = els.taskTitle.value.trim();

  if (!els.programEditor.value.trim()) {
    if (!title) {
      toast('Create a task or load a program first', 'warning');
      return;
    }
    const created = await createTask();
    if (!created) return;
    taskId = created.taskId;
    title = els.taskTitle.value.trim() || title;
  } else {
    taskId = parseTaskIdFromEditor();
    title = title || taskId;
    const persisted = await ensureProgramOnDisk(taskId, title);
    if (!persisted) return;
    taskId = persisted.taskId;
    title = persisted.title;
  }

  const description = await askDescription({
    heading: 'What should the agent add or change?',
    subtitle: `${taskId} · ${title}`,
  });
  if (!description) return;

  await startAgent({ taskId, title, description });
}

function bindEvents() {
  els.btnSetupApply?.addEventListener('click', () => void applyWorkspaceFromGate());
  els.btnSetupRecheck?.addEventListener('click', () => void refreshSetup());

  els.btnProgramEdit.addEventListener('click', () => enterProgramEdit());
  els.btnProgramApply.addEventListener('click', () => applyProgramEdits());
  els.btnCreate.addEventListener('click', () => void previewCreate());
  els.btnSave.addEventListener('click', () => void saveProgram());
  els.btnVerify.addEventListener('click', () => void verifyAcceptance());
  els.btnProgramAi.addEventListener('click', () => void createAndDraft());
  els.btnEnableAutostart.addEventListener('click', () => void enableAutostart());
  els.btnSidebarNew.addEventListener('click', () => void prepareNewTask());

  els.btnMore.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = els.moreMenu.classList.toggle('hidden');
    els.btnMore.setAttribute('aria-expanded', String(!open));
  });

  document.addEventListener('click', () => {
    els.moreMenu.classList.add('hidden');
    els.btnMore.setAttribute('aria-expanded', 'false');
  });

  els.moreMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    els.moreMenu.classList.add('hidden');
    els.btnMore.setAttribute('aria-expanded', 'false');
    const action = btn.dataset.action;
    if (action === 'new-id') void prepareNewTask();
    else if (action === 'draft-ai') void draftExisting();
    else if (action === 'reload') void reloadProgram();
  });

  els.programEditor.addEventListener('input', markDirty);

  els.programEditor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void saveProgram();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      applyProgramEdits();
    }
  });

  els.taskTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!els.btnCreate.classList.contains('hidden') && !els.btnCreate.disabled) {
        void previewCreate();
      } else {
        void els.btnProgramAi.click();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.moreMenu.classList.contains('hidden')) {
      els.moreMenu.classList.add('hidden');
      els.btnMore.setAttribute('aria-expanded', 'false');
      els.btnMore.focus();
    }
  });

  els.descForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.descText.value.trim();
    if (text.length < 20) {
      toast('Description too short', 'warning');
      return;
    }
    els.descDialog.close();
    state.descResolve?.(text);
    state.descResolve = null;
  });

  els.descCancel.addEventListener('click', () => {
    els.descDialog.close();
    state.descResolve?.(null);
    state.descResolve = null;
  });

  els.descDialog.addEventListener('close', () => {
    if (state.descResolve) {
      state.descResolve(null);
      state.descResolve = null;
    }
  });

  els.descText.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      els.descForm.requestSubmit();
    }
  });

  els.agentAskForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    void submitAgentAskAnswer();
  });
  els.agentAskCancel?.addEventListener('click', () => void cancelAgentAskAnswer());
  els.agentAskDialog?.addEventListener('cancel', (e) => {
    e.preventDefault();
    void cancelAgentAskAnswer();
  });

  els.agentBackend.addEventListener('change', () => {
    void (async () => {
      const backend = els.agentBackend.value;
      const data = await saveAgentSettings(
        { backend },
        { quiet: true, resetModelOnBackendChange: true },
      );
      const label =
        backend === 'claude' ? 'Claude' : backend === 'codex' ? 'Codex' : 'Cursor';
      if (data) {
        toast(`Provider: ${label}`, 'success');
      }
    })();
  });

  els.agentModel.addEventListener('change', () => {
    const model = els.agentModel.value.trim();
    if (!model) return;
    state.selectedModel = model;
    void saveAgentSettings({ model }, { quiet: true });
  });
}

async function init() {
  activityFeed = new ActivityFeed(els.activityFeed);
  taskSidebar = new TaskSidebar(els.taskList, {
    onSelect: (id) => void loadTask(id),
    onDelete: (id) => void deleteTask(id),
  });
  bindEvents();
  renderProgramPreview('');
  try {
    connectTasksWatch();

    const stateData = await bootStep('Caricamento workspace e impostazioni…', () =>
      refreshState({ skipModels: true }),
    );

    const tasks = await bootStep('Caricamento task…', () => loadTaskList());

    await bootStep('Verifica configurazione…', () => refreshSetup());

    if (stateData?.repoValid) {
      const saved = stateData.model ?? state.selectedModel;
      await bootStep('Caricamento modelli agent…', () =>
        loadAgentModels({ backend: els.agentBackend.value, selectedModel: saved }),
      );
    }

    if (getRepoPath()) {
      await bootStep('Sincronizzazione workspace…', () => syncWorkspace(getRepoPath()));
    }

    if (tasks?.tasks?.length === 1) {
      await bootStep('Apertura task…', () => loadTask(tasks.tasks[0].id));
    } else {
      activityFeed?.showPlaceholder('Select a task from the sidebar');
    }

    setBootMessage('Pronto');
    await new Promise((resolve) => setTimeout(resolve, 220));

    if (!getRepoPath() && els.setupRepoPath) {
      els.setupRepoPath.focus();
    }
  } catch {
    setBootMessage('Impossibile connettersi al server');
    await new Promise((resolve) => setTimeout(resolve, 700));
    toast('Cannot reach local server', 'error');
  } finally {
    hideBootLoader();
  }
}

init();
