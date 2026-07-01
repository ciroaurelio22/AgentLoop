# Agent Console

Local **web UI** to create and draft agent tasks without memorizing CLI commands.

## Quick start

```text
tools\agent-gui\run-gui.bat    ← double-click
pnpm agent:gui               ← from repo root
```

Opens the browser at `http://127.0.0.1:9477`.

## Layout

- **Activity** — last 3 agent actions (read, write, tools, status)
- **Program** — live-synced editor; updates when the agent modifies the file on disk

## Requirements

- Node.js 22+
- Cursor CLI (`agent`) installed and authenticated (`agent login`)

## Environment

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AGENT_GUI_PORT` | `9477` | Local server port |
| `AGENT_GUI_NO_OPEN` | — | Set `1` to skip opening the browser |
