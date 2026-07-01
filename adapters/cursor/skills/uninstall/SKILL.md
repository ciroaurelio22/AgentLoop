---
name: agent-loop-uninstall
description: >-
  Remove Agent Loop from the current repository. Use when the user asks to
  uninstall, remove, or decommission agent-loop from this project.
---
# Agent Loop — Uninstall

Remove the Agent Loop kit from **this repository** (not the global AgentLoop clone).

## Before you start

1. Confirm the user wants to remove Agent Loop from the **current workspace**.
2. Ask whether to keep task data (`.agent-loop/`, `specs/agent-tasks/`) or remove everything.
   - **Keep data** → use `--keep-data`
   - **Full removal** → default (no flag)

## Run the uninstaller

From the **target repo root**, run the kit uninstall script. If the kit is not local, clone it to a temp dir first (same as install):

```bash
node "<KIT_DIR>/bin/uninstall.mjs" --target .
```

With preserved queue and programs:

```bash
node "<KIT_DIR>/bin/uninstall.mjs" --target . --keep-data
```

Replace `<KIT_DIR>` with the AgentLoop kit path (clone from `https://github.com/ciroaurelio22/AgentLoop.git` if needed).

## What gets removed

| Path | Removed |
| ---- | ------- |
| `scripts/agent/` | Yes |
| `tools/agent-gui/` | Yes |
| `.cursor/hooks/` (agent-loop hooks) | Yes |
| `.cursor/hooks.json` | Yes |
| `.cursor/skills/uninstall`, `update` | Yes |
| `agent-loop.config.json` | Yes |
| `agent:*` scripts in `package.json` | Yes |
| Agent loop section in `CLAUDE.md` / `AGENTS.md` | Yes |
| `.agent-loop/`, `specs/agent-tasks/` | Only without `--keep-data` |

## After uninstall

- Confirm `pnpm agent:status` fails or script is gone.
- Remind the user that Cursor hooks and skills for agent-loop are no longer active.
- Do not delete the user's git history or unrelated project files.
