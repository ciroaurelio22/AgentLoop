#!/usr/bin/env node
/**
 * Agent Loop GUI — server locale (Node.js)
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  createReadStream,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProgramWatcher } from './lib/program-watcher.mjs';
import { QueueWatcher, readTaskSnapshot } from './lib/queue-watcher.mjs';
import { fillTaskTemplate } from './lib/template.mjs';
import { detectPackageManager } from '../../scripts/agent/lib/package-manager.mjs';
import {
  DEFAULT_PORT,
  TASK_ID_RE,
  defaultAgentModel,
  isValidRepo,
  loadConfig,
  loopDir,
  nextTaskId,
  resolveStartupRepo,
  saveConfig,
} from './lib/repo-utils.mjs';
import { parseStreamLine } from './lib/stream-parser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** @type {import('node:child_process').ChildProcess | null} */
let activeAgent = null;

/** @type {string | null} */
let repoRoot = resolveStartupRepo(process.cwd());

const programWatcher = new ProgramWatcher();
const queueWatcher = new QueueWatcher();

if (repoRoot) queueWatcher.setRepo(repoRoot);

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

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
    child.on('error', (err) => resolveRun({ code: 127, out: err.message }));
  });
}

function writeDraftPrompt({ taskId, title, taskRel, description, currentProgram }) {
  if (!repoRoot) throw new Error('Repository non impostato');
  const draftPath = join(loopDir(repoRoot), 'gui-draft-prompt.md');
  const pm = detectPackageManager(repoRoot);
  let body =
    `# Draft program — ${taskId}\n\n` +
    `## Task\n\n` +
    `- **ID:** ${taskId}\n` +
    `- **Titolo:** ${title}\n` +
    `- **File da completare:** \`${taskRel}\`\n\n` +
    `## Richiesta utente\n\n` +
    `${description.trim()}\n\n` +
    `## Istruzioni per l'agent\n\n` +
    `1. Esplora la codebase nel workspace \`${repoRoot}\` per capire file e moduli rilevanti.\n` +
    `2. Modifica **solo** \`${taskRel}\` — nessun altro file sorgente.\n` +
    `3. Compila tutte le sezioni del template program (Obiettivo, Vincoli, Scope, Acceptance, Verifica, Note).\n` +
    `4. Acceptance criteria: checklist \`- [ ]\` verificabili e specifiche.\n` +
    `5. Vincoli: usa ${pm} (package manager del repo), diff minimi, no merge autonomo, test se tocchi codice.\n` +
    `6. Scrivi in **italiano**, tono operativo Karpathy-style.\n`;
  if (currentProgram?.trim()) {
    body += `\n## Bozza attuale\n\n\`\`\`markdown\n${currentProgram.trim().slice(0, 12000)}\n\`\`\`\n`;
  }
  mkdirSync(dirname(draftPath), { recursive: true });
  writeFileSync(draftPath, body, 'utf8');
}

function getState() {
  const autostartPath = repoRoot ? join(loopDir(repoRoot), 'autostart') : null;
  return {
    repo: repoRoot,
    repoValid: repoRoot ? isValidRepo(repoRoot) : false,
    nextTaskId: repoRoot ? nextTaskId(repoRoot) : 'TASK-001',
    autostart: autostartPath ? existsSync(autostartPath) : false,
    model: defaultAgentModel(),
    agentBackend: (process.env.AGENT_BACKEND ?? 'cursor').toLowerCase(),
    agentRunning: activeAgent !== null && activeAgent.exitCode === null,
  };
}

function ensureRepo() {
  if (repoRoot && isValidRepo(repoRoot)) {
    queueWatcher.setRepo(repoRoot);
    return repoRoot;
  }
  const resolved = resolveStartupRepo(process.cwd());
  if (resolved) {
    repoRoot = resolved;
    queueWatcher.setRepo(repoRoot);
    return repoRoot;
  }
  return null;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/state') {
    ensureRepo();
    return sendJson(res, 200, getState());
  }

  if (req.method === 'POST' && url.pathname === '/api/repo') {
    try {
      const body = await readBody(req);
      const path = resolve(String(body.path ?? '').trim());
      if (!isValidRepo(path)) {
        return sendJson(res, 400, {
          error: 'Invalid workspace. Required: .agent-loop/, specs/agent-tasks/, scripts/agent/init-task.mjs',
        });
      }
      repoRoot = path;
      saveConfig({ ...loadConfig(), last_repo: path });
      queueWatcher.setRepo(repoRoot);
      return sendJson(res, 200, getState());
    } catch {
      return sendJson(res, 400, { error: 'Body JSON non valido' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/tasks') {
    const root = ensureRepo();
    return sendJson(res, 200, readTaskSnapshot(root));
  }

  if (req.method === 'GET' && url.pathname === '/api/watch/tasks') {
    ensureRepo();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const client = {
      write: (chunk) => res.write(chunk),
      end: () => res.end(),
    };

    const unsubscribe = queueWatcher.subscribe(client);

    req.on('close', () => {
      unsubscribe();
    });

    return undefined;
  }

  if (req.method === 'GET' && url.pathname === '/api/template') {
    const root = ensureRepo();
    if (!root) {
      return sendJson(res, 400, { error: 'Select a valid workspace' });
    }
    const taskId = String(url.searchParams.get('taskId') ?? '').trim().toUpperCase();
    const title = String(url.searchParams.get('title') ?? '').trim();
    if (!TASK_ID_RE.test(taskId)) {
      return sendJson(res, 400, { error: 'Invalid task ID' });
    }
    if (!title) {
      return sendJson(res, 400, { error: 'Title required' });
    }
    try {
      const program = fillTaskTemplate(root, taskId, title);
      return sendJson(res, 200, { taskId, title, program });
    } catch (err) {
      return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Template error' });
    }
  }

  if (!repoRoot || !isValidRepo(repoRoot)) {
    return sendJson(res, 400, { error: 'Select a valid workspace' });
  }

  const taskDeleteMatch = url.pathname.match(/^\/api\/tasks\/(TASK-\d+)$/i);
  if (taskDeleteMatch && req.method === 'DELETE') {
    const taskId = taskDeleteMatch[1].toUpperCase();
    const programPath = join(repoRoot, 'specs', 'agent-tasks', `${taskId}.md`);
    const queuePath = join(loopDir(repoRoot), 'queue.json');
    const statePath = join(loopDir(repoRoot), 'state.json');

    let queue = { tasks: [] };
    if (existsSync(queuePath)) {
      try {
        queue = JSON.parse(readFileSync(queuePath, 'utf8'));
      } catch {
        return sendJson(res, 500, { error: 'queue.json non valido' });
      }
    }

    const entry = (queue.tasks ?? []).find((t) => String(t.id).toUpperCase() === taskId);
    const status = entry?.status ?? (existsSync(programPath) ? 'draft' : null);

    if (!entry && !existsSync(programPath)) {
      return sendJson(res, 404, { error: 'Task non trovato' });
    }

    if (status === 'in_progress') {
      return sendJson(res, 409, { error: 'Impossibile eliminare un task in esecuzione' });
    }
    if (status === 'done' || status === 'blocked') {
      return sendJson(res, 409, { error: `Impossibile eliminare un task ${status}` });
    }

    if (entry) {
      queue.tasks = (queue.tasks ?? []).filter((t) => String(t.id).toUpperCase() !== taskId);
      mkdirSync(dirname(queuePath), { recursive: true });
      writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
    }

    if (existsSync(programPath)) {
      unlinkSync(programPath);
    }

    if (existsSync(statePath)) {
      try {
        const loopState = JSON.parse(readFileSync(statePath, 'utf8'));
        if (String(loopState.activeTaskId ?? '').toUpperCase() === taskId) {
          loopState.activeTaskId = null;
          writeFileSync(statePath, `${JSON.stringify(loopState, null, 2)}\n`, 'utf8');
        }
      } catch {
        /* ignore */
      }
    }

    queueWatcher.notify();
    return sendJson(res, 200, { ok: true, taskId });
  }

  if (req.method === 'POST' && url.pathname === '/api/tasks/create') {
    try {
      const body = await readBody(req);
      const taskId = String(body.taskId ?? '').trim().toUpperCase();
      const title = String(body.title ?? '').trim();
      if (!TASK_ID_RE.test(taskId)) {
        return sendJson(res, 400, { error: 'Task ID non valido' });
      }
      if (!title) return sendJson(res, 400, { error: 'Titolo obbligatorio' });
      const { code, out } = await runCommand(
        'node',
        [join(repoRoot, 'scripts', 'agent', 'init-task.mjs'), taskId, title],
        repoRoot,
      );
      if (code !== 0) return sendJson(res, 400, { error: out || `exit ${code}` });
      const programPath = join(repoRoot, 'specs', 'agent-tasks', `${taskId}.md`);
      const program = existsSync(programPath) ? readFileSync(programPath, 'utf8') : '';
      programWatcher.setTask(repoRoot, taskId);
      queueWatcher.setRepo(repoRoot);
      return sendJson(res, 200, {
        taskId,
        program,
        nextTaskId: nextTaskId(repoRoot),
      });
    } catch {
      return sendJson(res, 400, { error: 'Body JSON non valido' });
    }
  }

  const programMatch = url.pathname.match(/^\/api\/program\/(TASK-\d+)$/i);
  if (programMatch) {
    const taskId = programMatch[1].toUpperCase();
    const programPath = join(repoRoot, 'specs', 'agent-tasks', `${taskId}.md`);
    if (req.method === 'GET') {
      if (!existsSync(programPath)) return sendJson(res, 404, { error: 'Program non trovato' });
      return sendJson(res, 200, {
        taskId,
        program: readFileSync(programPath, 'utf8'),
      });
    }
    if (req.method === 'PUT') {
      try {
        const body = await readBody(req);
        const program = String(body.program ?? '').trimEnd() + '\n';
        mkdirSync(dirname(programPath), { recursive: true });
        programWatcher.markLocalWrite();
        writeFileSync(programPath, program, 'utf8');
        return sendJson(res, 200, { ok: true });
      } catch {
        return sendJson(res, 400, { error: 'Body JSON non valido' });
      }
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/acceptance') {
    try {
      const body = await readBody(req);
      const taskId = String(body.taskId ?? '').trim().toUpperCase();
      const programPath = join(repoRoot, 'specs', 'agent-tasks', `${taskId}.md`);
      if (!existsSync(programPath)) return sendJson(res, 404, { error: 'Program non trovato' });
      const { code, out } = await runCommand(
        'node',
        [join(repoRoot, 'scripts', 'agent', 'check-acceptance.mjs'), programPath],
        repoRoot,
      );
      return sendJson(res, 200, { ok: code === 0, output: out, code });
    } catch {
      return sendJson(res, 400, { error: 'Body JSON non valido' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/autostart') {
    const autostartPath = join(loopDir(repoRoot), 'autostart');
    mkdirSync(dirname(autostartPath), { recursive: true });
    writeFileSync(autostartPath, '', 'utf8');
    queueWatcher.notify();
    return sendJson(res, 200, { ok: true, autostart: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/watch/program') {
    const taskId = String(url.searchParams.get('taskId') ?? '').trim().toUpperCase();
    if (!TASK_ID_RE.test(taskId)) {
      return sendJson(res, 400, { error: 'Invalid task ID' });
    }

    programWatcher.setTask(repoRoot, taskId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const client = {
      write: (chunk) => res.write(chunk),
      end: () => res.end(),
    };

    const unsubscribe = programWatcher.subscribe(client);

    req.on('close', () => {
      unsubscribe();
    });

    return undefined;
  }

  if (req.method === 'POST' && url.pathname === '/api/agent/start') {
    if (activeAgent && activeAgent.exitCode === null) {
      return sendJson(res, 409, { error: 'Agent already running' });
    }

    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: 'Body JSON non valido' });
    }

    const taskId = String(body.taskId ?? '').trim().toUpperCase();
    const title = String(body.title ?? '').trim();
    const description = String(body.description ?? '').trim();
    const currentProgram = String(body.currentProgram ?? '');

    if (!TASK_ID_RE.test(taskId)) return sendJson(res, 400, { error: 'Task ID non valido' });
    if (description.length < 20) {
      return sendJson(res, 400, { error: 'Descrizione troppo breve (min 20 caratteri)' });
    }

    const taskRel = `specs/agent-tasks/${taskId}.md`;
    writeDraftPrompt({
      taskId,
      title: title || taskId,
      taskRel,
      description,
      currentProgram,
    });

    programWatcher.setTask(repoRoot, taskId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const script = join(repoRoot, 'scripts', 'agent', 'run-agent.mjs');
    const backend = (process.env.AGENT_BACKEND ?? 'cursor').toLowerCase();
    const args = [
      '--workspace',
      repoRoot,
      '--task',
      taskRel,
      '--model',
      defaultAgentModel(),
      '--backend',
      backend,
    ];

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('chunk', { kind: 'status', text: 'Avvio agent…' });

    activeAgent = spawn('node', [script, ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: true,
    });

    let lineBuffer = '';

    const emitLine = (line) => {
      const chunk = parseStreamLine(line);
      if (chunk) sendEvent('chunk', chunk);
    };

    const onData = (buf) => {
      lineBuffer += buf.toString('utf8');
      let idx;
      while ((idx = lineBuffer.indexOf('\n')) >= 0) {
        const line = lineBuffer.slice(0, idx);
        lineBuffer = lineBuffer.slice(idx + 1);
        emitLine(line);
      }
    };

    activeAgent.stdout?.on('data', onData);
    activeAgent.stderr?.on('data', onData);

    activeAgent.on('close', (code) => {
      if (lineBuffer.trim()) emitLine(lineBuffer);
      lineBuffer = '';
      const exitCode = code ?? 1;
      let program = '';
      const programPath = join(repoRoot, 'specs', 'agent-tasks', `${taskId}.md`);
      if (existsSync(programPath)) {
        program = readFileSync(programPath, 'utf8');
      }
      sendEvent('done', { code: exitCode, program, taskId });
      activeAgent = null;
      res.end();
    });

    activeAgent.on('error', (err) => {
      sendEvent('error', { message: err.message });
      sendEvent('done', { code: 127, program: '', taskId });
      activeAgent = null;
      res.end();
    });

    req.on('close', () => {
      if (activeAgent && activeAgent.exitCode === null) {
        const pid = activeAgent.pid;
        if (process.platform === 'win32' && pid) {
          spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
            stdio: 'ignore',
            windowsHide: true,
          });
        } else {
          activeAgent.kill('SIGTERM');
        }
      }
    });

    return undefined;
  }

  sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let filePath = join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(PUBLIC_DIR, 'index.html');
  }
  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}

function createAppServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${DEFAULT_PORT}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args =
    process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function main() {
  const port = Number(process.env.AGENT_GUI_PORT) || DEFAULT_PORT;
  const server = createAppServer();
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Agent Console → ${url}`);
    if (repoRoot) console.log(`Workspace: ${repoRoot}`);
    else console.log('No workspace — set path in UI');
    if (process.env.AGENT_GUI_NO_OPEN !== '1') {
      openBrowser(url);
    }
  });
}

main();
