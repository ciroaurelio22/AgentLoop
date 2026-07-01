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
2. Runs `bin/install.mjs --target . --all --force --updated` from that fresh copy

Optional flags:

```bash
node scripts/agent/update.mjs --target . --branch master
node scripts/agent/update.mjs --target . --kit-dir "C:/path/to/cache"
```

## Restart Agent Console (required)

After every update, **restart the web UI**. The kit replaces files on disk (`tools/agent-gui/`, scripts, hooks), but a server already listening on port **9477** keeps the **old code in memory**. `pnpm agent:gui:ensure` alone does **not** restart a healthy running instance.

1. **Stop** the current Agent Console:
   - Close the terminal that runs `pnpm agent:gui`, **or**
   - Kill the PID stored in `.agent-loop/gui.pid` (Windows: `taskkill /F /PID <pid>`, Unix: `kill <pid>`)
2. **Start** it again:

```bash
pnpm agent:gui:ensure
```

Or open it manually:

```bash
pnpm agent:gui
```

3. **Reload** the browser tab at `http://127.0.0.1:9477` (hard refresh if needed).

Always tell the user to restart Agent Console after an update completes.

## Preserved user data

The installer does **not** overwrite:

- `.agent-loop/queue.json`
- `.agent-loop/scratchpad.md`
- `.agent-loop/autostart`
- `specs/agent-tasks/TASK-*.md`

## Verify after update

```bash
pnpm agent:status
# restart Agent Console (see above), then:
pnpm agent:gui:ensure
```

Report what changed (scripts, hooks, GUI, skills), confirm queue/tasks are intact, and remind the user to **reload the browser** after the GUI restart.

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
