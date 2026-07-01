import { ActivityFeed } from './activity-feed.js';
import { TaskSidebar } from './task-sidebar.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  repoPath: $('#repo-path'),
  btnSetRepo: $('#btn-set-repo'),
  autostartGate: $('#autostart-gate'),
  btnEnableAutostart: $('#btn-enable-autostart'),
  taskId: $('#task-id'),
  taskTitle: $('#task-title'),
  btnCreate: $('#btn-create'),
  btnProgramAi: $('#btn-program-ai'),
  btnMore: $('#btn-more'),
  moreMenu: $('#more-menu'),
  cliInfo: $('#cli-info'),
  taskList: $('#task-list'),
  btnSidebarNew: $('#btn-sidebar-new'),
  activityFeed: $('#activity-feed'),
  programFile: $('#program-file'),
  programSync: $('#program-sync'),
  programEditor: $('#program-editor'),
  btnStop: $('#btn-stop'),
  descDialog: $('#desc-dialog'),
  descForm: $('#desc-form'),
  descHeading: $('#desc-heading'),
  descSubtitle: $('#desc-subtitle'),
  descText: $('#desc-text'),
  descCancel: $('#desc-cancel'),
  descSubmit: $('#desc-submit'),
  toast: $('#toast'),
};

const state = {
  taskId: 'TASK-001',
  activeProgramId: null,
  agentRunning: false,
  descResolve: null,
  diskContent: '',
  dirty: false,
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

function toast(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 3500);
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
  els.btnProgramAi.disabled = busy;
  els.btnSidebarNew.disabled = busy;
  els.btnStop.disabled = !busy;
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

async function ensureTaskPersisted() {
  const taskId = state.taskId;
  const title = els.taskTitle.value.trim();
  if (!title) {
    toast('Enter a title', 'warning');
    return null;
  }
  try {
    await api(`/api/program/${taskId}`);
    setCreateVisible(false);
    return { taskId, title };
  } catch {
    try {
      const program = els.programEditor.value;
      await api('/api/tasks/create', {
        method: 'POST',
        body: JSON.stringify({ taskId, title }),
      });
      if (program.trim()) {
        await api(`/api/program/${taskId}`, {
          method: 'PUT',
          body: JSON.stringify({ program }),
        });
      }
      const data = await refreshState();
      state.taskId = data.nextTaskId;
      els.taskId.textContent = data.nextTaskId;
      setActiveProgram(taskId);
      taskSidebar?.select(taskId);
      await loadTaskList();
      setCreateVisible(false);
      return { taskId, title };
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  }
}

function setAutostart(enabled) {
  document.body.classList.toggle('autostart-blocked', !enabled);
  els.autostartGate?.classList.toggle('hidden', enabled);
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

function applyProgramContent(program, { fromDisk = false } = {}) {
  if (fromDisk && state.dirty) return false;
  els.programEditor.value = program;
  state.diskContent = program;
  state.dirty = false;
  setSyncBadge('live');
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
    setAutostart(Boolean(tasks.autostart));
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
      if (typeof snapshot.autostart === 'boolean') setAutostart(snapshot.autostart);
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
  taskSidebar?.select(id);

  const meta = lastTaskSnapshot.find((t) => t.id === id);
  if (meta?.title) els.taskTitle.value = meta.title;

  try {
    const data = await api(`/api/program/${id}`);
    applyProgramContent(data.program);
    setActiveProgram(id);
  } catch {
    toast('Program not found', 'warning');
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

async function refreshState() {
  const data = await api('/api/state');
  if (data.repo) els.repoPath.value = data.repo;
  state.taskId = data.nextTaskId;
  els.taskId.textContent = data.nextTaskId;
  els.cliInfo.textContent = data.model ?? '—';
  setAutostart(Boolean(data.autostart));
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

async function prepareNewTask() {
  await refreshState();
  els.taskTitle.value = '';
  els.programEditor.value = '';
  state.diskContent = '';
  state.dirty = false;
  state.activeProgramId = null;
  els.programFile.textContent = '—';
  setSyncBadge('idle');
  taskSidebar?.select(null);
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
    toast('Autostart enabled', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    els.btnEnableAutostart.disabled = false;
  }
}

async function stopAgent() {
  try {
    await api('/api/agent/stop', { method: 'POST', body: '{}' });
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function startAgent({ taskId, title, description }) {
  activityFeed = new ActivityFeed(els.activityFeed);
  activityFeed.clear();
  activityFeed.push({ type: 'status', label: 'Starting agent…', status: 'running' });
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

  const handleEvent = (event, data) => {
    if (event === 'chunk') {
      activityFeed?.fromChunk(data);
      setStatus('Running', 'running');
    } else if (event === 'done') {
      activityFeed?.finish(data.code);
      setBusy(false);
      if (data.code === 0) {
        setStatus('Done', 'done');
        if (data.program) applyProgramContent(data.program, { fromDisk: !state.dirty });
        toast('Program ready — review and verify', 'success');
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
  }

  const description = await askDescription({
    heading: 'What should the agent add or change?',
    subtitle: `${taskId} · ${title}`,
  });
  if (!description) return;

  await startAgent({ taskId, title, description });
}

function bindEvents() {
  els.btnSetRepo.addEventListener('click', async () => {
    const path = els.repoPath.value.trim();
    if (!path) return;
    const ok = await syncWorkspace(path);
    if (!ok) {
      toast('Invalid workspace path', 'error');
      return;
    }
    await refreshState();
    connectTasksWatch();
    await loadTaskList();
    toast('Workspace applied', 'success');
  });

  els.btnCreate.addEventListener('click', () => void previewCreate());
  els.btnProgramAi.addEventListener('click', () => void createAndDraft());
  els.btnEnableAutostart.addEventListener('click', () => void enableAutostart());
  els.btnSidebarNew.addEventListener('click', () => void prepareNewTask());
  els.btnStop.addEventListener('click', () => void stopAgent());

  els.btnMore.addEventListener('click', (e) => {
    e.stopPropagation();
    els.moreMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', () => els.moreMenu.classList.add('hidden'));

  els.moreMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    els.moreMenu.classList.add('hidden');
    const action = btn.dataset.action;
    if (action === 'save') void saveProgram();
    else if (action === 'verify') void verifyAcceptance();
    else if (action === 'new-id') void prepareNewTask();
    else if (action === 'draft-ai') void draftExisting();
    else if (action === 'reload') void reloadProgram();
    else if (action === 'stop-agent') void stopAgent();
  });

  els.programEditor.addEventListener('input', markDirty);

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
}

async function init() {
  activityFeed = new ActivityFeed(els.activityFeed);
  taskSidebar = new TaskSidebar(els.taskList, {
    onSelect: (id) => void loadTask(id),
  });
  bindEvents();
  try {
    await refreshState();
    if (els.repoPath.value.trim()) {
      await syncWorkspace(els.repoPath.value);
    }
    connectTasksWatch();
    const tasks = await loadTaskList();
    if (tasks?.tasks?.length === 1) {
      await loadTask(tasks.tasks[0].id);
    }
    if (!els.repoPath.value.trim()) {
      toast('Set workspace path to begin', 'warning');
    }
  } catch {
    toast('Cannot reach local server', 'error');
  }
}

init();
