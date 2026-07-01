/** Parser stream-json Cursor CLI → chunk strutturati per la UI chat. */

const PROMPT_MARKER = 'Completa il program del task agent loop';

function contentText(content) {
  if (typeof content === 'string' && content) return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (typeof block === 'string') parts.push(block);
    else if (block && typeof block === 'object') {
      const text = block.text ?? block.content;
      if (typeof text === 'string' && text) parts.push(text);
    }
  }
  return parts.join('');
}

function extractAssistantText(obj) {
  const msg = obj.message;
  if (typeof msg === 'string' && msg) return msg;
  if (msg && typeof msg === 'object') {
    const text = contentText(msg.content) || msg.text;
    if (typeof text === 'string' && text) return text;
  }
  const direct = contentText(obj.content) || obj.text || obj.delta;
  return typeof direct === 'string' ? direct : '';
}

function basename(path) {
  if (!path) return '';
  const norm = String(path).replace(/\\/g, '/');
  const parts = norm.split('/');
  return parts[parts.length - 1] || norm;
}

function shortenPath(path) {
  if (!path) return '';
  const norm = String(path).replace(/\\/g, '/');
  const idx = norm.indexOf('/Vigila81/');
  if (idx >= 0) return norm.slice(idx + '/Vigila81/'.length);
  return basename(norm);
}

/** @returns {{ label: string; detail: string } | null} */
export function extractTool(obj) {
  const tc = obj.tool_call;
  if (!tc || typeof tc !== 'object') return null;

  const defs = [
    ['readToolCall', 'Read', (a) => shortenPath(a.path)],
    ['writeToolCall', 'Write', (a) => shortenPath(a.path)],
    ['grepToolCall', 'Grep', (a) => a.pattern ?? a.query ?? ''],
    ['shellToolCall', 'Shell', (a) => (a.command ?? '').slice(0, 72)],
    ['listToolCall', 'List', (a) => shortenPath(a.path)],
    ['searchToolCall', 'Search', (a) => a.query ?? ''],
    ['deleteToolCall', 'Delete', (a) => shortenPath(a.path)],
  ];

  for (const [key, label, pick] of defs) {
    const call = tc[key];
    if (call && typeof call === 'object') {
      const args = call.args ?? {};
      return { label, detail: pick(args) ?? '' };
    }
  }

  const mcp = tc.mcpToolCall;
  if (mcp?.args) {
    const name = mcp.args.toolName ?? mcp.args.name ?? 'tool';
    return { label: 'MCP', detail: String(name).replace(/^sonarqube-/, '') };
  }

  const fn = tc.function;
  if (fn?.name) return { label: fn.name, detail: '' };

  return { label: 'Tool', detail: '' };
}

/**
 * @param {string} line
 * @returns {object | null} chunk UI o null se ignorare
 */
export function parseStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('[run-agent]') || trimmed.startsWith('[run-gui-agent]')) {
    const text = trimmed.replace(/^\[run-(?:agent|gui-agent)\]\s*/, '');
    if (/^(agent|workspace|task):/.test(text)) return null;
    if (text.startsWith('model:')) {
      return { kind: 'meta', text: `Modello · ${text.slice(6).trim()}` };
    }
    return { kind: 'meta', text };
  }

  if (!trimmed.startsWith('{')) {
    if (trimmed.includes(PROMPT_MARKER)) {
      return { kind: 'user', text: 'Completa il program del task agent loop Vigila81…' };
    }
    return { kind: 'assistant', delta: trimmed };
  }

  let obj;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!obj || typeof obj !== 'object') return null;

  const type = obj.type ?? '';
  const subtype = obj.subtype ?? '';

  if (type === 'system') {
    if (subtype === 'init') {
      return {
        kind: 'session',
        model: obj.model ?? 'Agent',
        cwd: obj.cwd ?? '',
      };
    }
    return null;
  }

  if (type === 'thinking' || type === 'ping' || type === 'heartbeat') return null;

  if (type === 'tool_call') {
    const callId = obj.call_id ?? obj.toolCallId ?? '';
    const tool = extractTool(obj);
    if (!tool) return null;
    if (subtype === 'started') {
      return { kind: 'tool', callId, status: 'running', ...tool };
    }
    if (subtype === 'completed') {
      return { kind: 'tool', callId, status: 'done', ...tool };
    }
    return null;
  }

  if (type === 'assistant') {
    if ('model_call_id' in obj && !extractAssistantText(obj)) return null;
    const text = extractAssistantText(obj);
    if (text) return { kind: 'assistant', delta: text };
    return null;
  }

  if (type === 'user') {
    const text = extractAssistantText(obj);
    if (text && !text.includes(PROMPT_MARKER)) {
      return { kind: 'user', text };
    }
    if (text?.includes(PROMPT_MARKER)) {
      return { kind: 'user', text: 'Completa il program del task agent loop Vigila81…' };
    }
    return null;
  }

  if (type === 'error' || type === 'stderr') {
    const err = obj.error ?? obj.message ?? obj.text;
    const msg =
      typeof err === 'string'
        ? err
        : err && typeof err === 'object'
          ? err.message ?? err.text ?? ''
          : '';
    if (msg) return { kind: 'error', text: msg };
    return null;
  }

  if (type === 'result') {
    const text = typeof obj.result === 'string' ? obj.result : extractAssistantText(obj);
    if (text) return { kind: 'assistant', delta: text };
    return null;
  }

  return null;
}
