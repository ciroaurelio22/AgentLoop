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
- **Sidebar** — task queue; status badge + linked PR when `gh` is available
- **Activity** — last 3 agent actions (read, write, tools, status)
- **Program** — live-synced editor; updates when the agent modifies the file on disk
- **Footer** — provider (Cursor / Claude) and model dropdown; models are fetched from the configured CLI (`agent models` / future `claude model list`)

## Requirements

- Node.js 22+
- Valid Agent Loop workspace (`.agent-loop/`, `specs/agent-tasks/`, `scripts/agent/`)
- Autostart file (`.agent-loop/autostart`)
- Cursor CLI (`agent`) or Claude Code CLI (`claude`), installed and authenticated
- [**GitHub CLI**](https://cli.github.com/) (`gh`, optional): PR badges in the task sidebar

On first open, Agent Console shows a **setup gate** until all required checks pass. Optional items (e.g. `gh`) do not block the UI.

With Cursor hooks installed (`install.mjs --cursor`), the **`ensure-gui`** hook on **sessionStart** checks whether Agent Console is up (`/api/state` on port 9477) and starts it if not (requires `.agent-loop/autostart`).

Manual ensure: `pnpm agent:gui:ensure`

## Environment

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AGENT_GUI_PORT` | `9477` | Local server port |
| `AGENT_GUI_NO_OPEN` | — | Set `1` to skip opening the browser |
