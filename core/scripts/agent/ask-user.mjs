#!/usr/bin/env node
/**
 * Synchronous user question for agents running from Agent Console.
 *
 * Blocks until the user answers in the GUI popup (or times out).
 *
 * Usage:
 *   node scripts/agent/ask-user.mjs "Quale API usare per X?"
 *   node scripts/agent/ask-user.mjs --question "Scope?" --option "Solo web" --option "Web + API"
 *   node scripts/agent/ask-user.mjs --json '{"question":"...", "options":["A","B"]}'
 *
 * Prints the answer on stdout. Exit 0 on success, 1 on error/cancel/timeout.
 */
const DEFAULT_PORT = 9477;
const DEFAULT_TIMEOUT_MS = 600_000;

function parseArgs(argv) {
  /** @type {{ question: string; options: string[]; allowMultiple: boolean; json: boolean; timeoutMs: number }} */
  const out = {
    question: '',
    options: [],
    allowMultiple: false,
    json: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json' && argv[i + 1]) {
      out.json = true;
      const payload = JSON.parse(argv[++i]);
      out.question = String(payload.question ?? '').trim();
      out.options = Array.isArray(payload.options)
        ? payload.options.map((o) => String(o).trim()).filter(Boolean)
        : [];
      out.allowMultiple = Boolean(payload.allowMultiple);
      if (payload.timeoutMs) out.timeoutMs = Number(payload.timeoutMs) || out.timeoutMs;
      continue;
    }
    if (arg === '--question' && argv[i + 1]) {
      out.question = String(argv[++i]).trim();
      continue;
    }
    if (arg === '--option' && argv[i + 1]) {
      out.options.push(String(argv[++i]).trim());
      continue;
    }
    if (arg === '--allow-multiple') {
      out.allowMultiple = true;
      continue;
    }
    if (arg === '--timeout-ms' && argv[i + 1]) {
      out.timeoutMs = Number(argv[++i]) || out.timeoutMs;
      continue;
    }
    if (!arg.startsWith('-') && !out.question) {
      out.question = arg.trim();
    }
  }

  return out;
}

function resolvePort() {
  const fromEnv = Number(process.env.AGENT_GUI_PORT);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_PORT;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.question) {
    console.error(
      'Usage: node ask-user.mjs "Question?" [--option "Choice"] [--allow-multiple]',
    );
    process.exit(2);
  }

  const port = resolvePort();
  const url = `http://127.0.0.1:${port}/api/agent/ask`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs + 5_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: args.question,
        options: args.options,
        allowMultiple: args.allowMultiple,
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.error(data.error ?? `HTTP ${res.status}`);
      process.exit(1);
    }
    process.stdout.write(String(data.answer ?? ''));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message.includes('abort') ? 'Timed out waiting for user answer' : message);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

main();
