/** @type {typeof import('marked').marked | undefined} */
const markedApi = globalThis.marked;

if (markedApi?.setOptions) {
  markedApi.setOptions({
    gfm: true,
    headerIds: false,
    mangle: false,
  });
}

const EMPTY_HTML =
  '<p class="program-preview-empty">Program content will appear here…</p>';

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {string | null | undefined} source */
export function renderProgramMarkdown(source) {
  const raw = source ?? '';
  if (!raw.trim()) return EMPTY_HTML;
  if (markedApi?.parse) {
    try {
      return markedApi.parse(raw);
    } catch {
      /* fall through */
    }
  }
  return `<pre class="program-preview-fallback">${escapeHtml(raw)}</pre>`;
}
