---
name: agent-loop-update
description: >-
  Update Agent Loop in the current repository from the official GitHub kit.
  Use when the user asks to update, upgrade, or refresh agent-loop.
---
# Agent Loop — Update

Pull the latest kit from **GitHub** (`https://github.com/ciroaurelio22/AgentLoop.git`) and reinstall into **this repository**, preserving queue and task programs.

## Run the updater

From the **target repo root**:

```bash
pnpm agent:update
```

Or directly:

```bash
node scripts/agent/update.mjs --target .
```

The script:

1. Clones or `git pull`s the kit into `%TEMP%/agent-loop-kit` (or `$TMPDIR/agent-loop-kit`)
2. Runs `bin/install.mjs --target . --all --force` from that fresh copy

Optional flags:

```bash
node scripts/agent/update.mjs --target . --branch master
node scripts/agent/update.mjs --target . --kit-dir "C:/path/to/cache"
```

## Preserved user data

The installer does **not** overwrite:

- `.agent-loop/queue.json`
- `.agent-loop/scratchpad.md`
- `.agent-loop/autostart`
- `specs/agent-tasks/TASK-*.md`

## Verify after update

```bash
pnpm agent:status
pnpm agent:gui:ensure
```

Report what changed (scripts, hooks, GUI, skills) and confirm queue/tasks are intact.

## Constraints

- Source of truth is the GitHub repo — do not hand-patch kit files in the target repo.
- Do not overwrite user task programs or queue state.
- Requires **git** in PATH for clone/pull.

## Automatic update check

The kit compares `.agent-loop/kit-version` with `VERSION` on GitHub (default: every **7 days**).

- Hook `agent-update-check` runs on Agent session start but **skips network** until the interval elapses.
- Manual check: `pnpm agent:check-update` or `pnpm agent:check-update --force`
- Snooze reminders: `pnpm agent:check-update --snooze 14`
- Dismiss current remote version: `pnpm agent:check-update --dismiss`

Configure in `agent-loop.config.json`:

```json
"updateCheck": {
  "enabled": true,
  "intervalDays": 7,
  "branch": "master",
  "repo": "ciroaurelio22/AgentLoop"
}
```

When releasing a new kit version, bump the root **`VERSION`** file in the GitHub repo.
