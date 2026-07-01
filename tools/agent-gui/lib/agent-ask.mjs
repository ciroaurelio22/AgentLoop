/** Pending user questions during an active GUI agent run. */

/** @type {((event: string, data: object) => void) | null} */
let broadcast = null;

/** @type {Map<string, { resolve: (value: string) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }>} */
const pending = new Map();

let askSeq = 0;

/** @param {((event: string, data: object) => void) | null} fn */
export function setAgentAskBroadcaster(fn) {
  broadcast = fn;
}

export function clearAgentAskBroadcaster() {
  broadcast = null;
  for (const [id, entry] of pending) {
    clearTimeout(entry.timeout);
    entry.reject(new Error('Agent session ended'));
    pending.delete(id);
  }
}

/**
 * @param {{ question: string; options?: string[]; allowMultiple?: boolean }} input
 * @param {{ timeoutMs?: number }} [options]
 */
export function requestUserInput(input, options = {}) {
  const question = String(input.question ?? '').trim();
  if (!question) {
    return Promise.reject(new Error('Question is required'));
  }
  if (!broadcast) {
    return Promise.reject(
      new Error('Agent Console has no active run — start the agent from the GUI'),
    );
  }

  const id = `ask-${++askSeq}-${Date.now()}`;
  const timeoutMs = options.timeoutMs ?? 600_000;
  const optionsList = Array.isArray(input.options)
    ? input.options.map((o) => String(o).trim()).filter(Boolean)
    : [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('User did not answer in time'));
    }, timeoutMs);

    pending.set(id, { resolve, reject, timeout });
    broadcast('ask', {
      id,
      question,
      options: optionsList,
      allowMultiple: Boolean(input.allowMultiple),
    });
  });
}

/**
 * @param {string} id
 * @param {{ answer?: string; answers?: string[]; cancelled?: boolean }} payload
 */
export function answerUserInput(id, payload) {
  const entry = pending.get(id);
  if (!entry) return false;

  clearTimeout(entry.timeout);
  pending.delete(id);

  if (payload.cancelled) {
    entry.reject(new Error('User cancelled'));
    return true;
  }

  if (Array.isArray(payload.answers) && payload.answers.length) {
    entry.resolve(payload.answers.join(', '));
    return true;
  }

  const answer = String(payload.answer ?? '').trim();
  if (!answer) {
    entry.reject(new Error('Empty answer'));
    return true;
  }

  entry.resolve(answer);
  return true;
}
