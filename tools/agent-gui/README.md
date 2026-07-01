# Agent Console

Local **web UI** to create and draft agent tasks without memorizing CLI commands.

## Quick start

```text
tools\agent-gui\run-gui.bat    ← double-click
pnpm agent:gui               ← from repo root
```

Opens the browser at `http://127.0.0.1:9477`.

## Layout

- **Setup gate** — blocks the UI until workspace, autostart, and agent CLI are ready (`gh` is optional)
- **Sidebar (left)** — task queue; status badge + linked PR when `gh` is available
- **Center** — task composer (title + Create), Program editor with **Save** / **Verify** / **Run AI**, provider & model footer
- **Activity (right rail)** — recent agent actions (tools, status, errors), scrollable
- **More menu (···)** — Complete with AI, Reload file, New task

### Keyboard shortcuts

- `Enter` in title — create task (or start AI if a task is loaded)
- `Ctrl/Cmd + S` in editor — save program
- `Ctrl + Enter` in AI dialog — confirm request
- `Esc` — close the more menu

### Theme

The console follows the system theme automatically (light/dark) via `prefers-color-scheme`.

## Requirements

- Node.js 22+
- Valid Agent Loop workspace (`.agent-loop/`, `specs/agent-tasks/`, `scripts/agent/`)
- Autostart file (`.agent-loop/autostart`)
- Cursor CLI (`agent`) or Claude Code CLI (`claude`) or OpenAI Codex CLI (`codex`), installed and authenticated
- [**GitHub CLI**](https://cli.github.com/) (`gh`, optional): PR badges in the task sidebar

On first open, Agent Console shows a **setup gate** until all required checks pass. Optional items (e.g. `gh`) do not block the UI.

With Cursor hooks installed (`install.mjs --cursor`), the **`ensure-gui`** hook on **sessionStart** checks whether Agent Console is up (`/api/state` on port 9477) and starts it if not (requires `.agent-loop/autostart`).

Manual ensure: `pnpm agent:gui:ensure`

## Environment

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AGENT_GUI_PORT` | `9477` | Local server port |
| `AGENT_GUI_NO_OPEN` | — | Set `1` to skip opening the browser |
