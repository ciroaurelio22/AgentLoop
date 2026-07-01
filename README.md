# Agent Loop

Standalone kit by **SynapseX** — Karpathy-style autonomous coding workflow for any repository.

You write a **program** per task (`specs/agent-tasks/TASK-001.md`). A coding agent implements, verifies, and loops until acceptance criteria pass. Works with **Cursor CLI** and **Claude Code CLI** — not tied to a single IDE.

```text
Vague idea → program.md → coding agent → PR → human review → merge
```

## What you get

| Component | Purpose |
| --------- | ------- |
| `specs/agent-tasks/*.md` | Task programs (objective, constraints, acceptance) |
| `.agent-loop/` | Queue, scratchpad, autostart flag |
| `scripts/agent/` | CLI: init, next, verify, acceptance |
| `tools/agent-gui/` | Optional web console (Create, Program editor, AI button) |
| `.cursor/hooks/` | Optional Cursor IDE adapter (auto-inject + verify on stop) |
| `.cursor/skills/uninstall`, `update` | Cursor skills to remove or update the kit in this repo |
| `CLAUDE.md` snippet | Claude Code adapter (manual or headless) |

## Requirements

- **Node.js 22+**
- **Git** repository
- **Package manager** with `lint` / `typecheck` / `test` scripts (pnpm, npm, or yarn)
- **One coding agent CLI** (install one or both):

| Agent | CLI | Install |
| ----- | --- | ------- |
| **Cursor** | `agent` | [Cursor CLI docs](https://cursor.com/docs/cli/overview) — then `agent login` |
| **Claude Code** | `claude` | [Claude Code setup](https://code.claude.com/docs/en/setup) — then authenticate |

## Quick install (manual)

```bash
git clone https://github.com/ciroaurelio22/AgentLoop.git
cd your-project

node /path/to/AgentLoop/bin/install.mjs --target . --all
node -e "require('node:fs').mkdirSync('.agent-loop',{recursive:true}); require('node:fs').writeFileSync('.agent-loop/autostart','')"
pnpm agent:init TASK-001 "My first task"
pnpm agent:next
```

Flags:

- `--cursor` — copy Cursor hooks to `.cursor/hooks/` and skills to `.cursor/skills/`
- `--claude` — append agent-loop section to `CLAUDE.md` / `AGENTS.md`
- `--gui` — copy web console to `tools/agent-gui/`
- `--all` — all of the above (default if no adapter flags passed)

## Configure verify

Edit `agent-loop.config.json` in your repo root:

```json
{
  "loopDir": ".agent-loop",
  "defaults": {
    "branchPrefix": "agent",
    "baseBranch": "main"
  },
  "verify": {
    "packageManager": "auto",
    "mode": "root",
    "packages": {
      "apps/web/": "@myapp/web",
      "apps/api/": "@myapp/api"
    }
  }
}
```

- **`packageManager: "auto"`** (default) — detected at verify time from lockfiles or `package.json#packageManager`. Pin only if needed (`pnpm`, `npm`, `yarn`, `bun`).
- Check detection: `node scripts/agent/detect-pm.mjs`
- **`mode: "root"`** — runs `<pm> run lint` etc. at repo root (single-package repos).
- **`packages`** — path prefix → package name for monorepos (see example).

## Daily workflow

```bash
pnpm agent:init TASK-042 "Add dark mode"
# Edit specs/agent-tasks/TASK-042.md — fill acceptance criteria
pnpm agent:register TASK-042   # if created manually
pnpm agent:next                # print prompt for the agent
pnpm agent:verify                # lint + typecheck + test (touched packages)
pnpm agent:acceptance TASK-042   # check program checklist
pnpm agent:status
```

Optional GUI:

```bash
pnpm agent:gui
# → http://127.0.0.1:9477
```

## Agent backends (Cursor vs Claude)

Set before starting the GUI or `run-agent.mjs`:

```bash
# Cursor CLI (default)
export AGENT_BACKEND=cursor
export AGENT_MODEL=composer-2.5-fast

# Claude Code CLI
export AGENT_BACKEND=claude
export AGENT_MODEL=claude-sonnet-4-6
```

Headless examples:

```bash
# Cursor
agent -p "Fix the failing test in auth.ts" --workspace . --trust

# Claude Code
claude -p "Fix the failing test in auth.ts" --permission-mode acceptEdits
```

Bootstrap task context into any session:

```bash
node scripts/agent/next-task.mjs --context   # JSON for IDE injection
node scripts/agent/next-task.mjs             # plain-text prompt
```

## Cursor adapter

After `install.mjs --cursor`:

1. Hooks in `.cursor/hooks.json` inject the next task on **Agent** session start.
2. **`ensure-gui`** hook starts the web console if it is not already running (`http://127.0.0.1:9477`).
3. Create empty file `.agent-loop/autostart` to enable bootstrap in local IDE sessions (task injection + GUI).
4. `stop` hook runs verify + enforces acceptance before accepting `DONE` in scratchpad.

Manual check: `pnpm agent:gui:ensure`

## Claude Code adapter

After `install.mjs --claude`:

1. Read the **Agent loop** section in `CLAUDE.md`.
2. Start a session: run `pnpm agent:next` and paste the prompt, or use `claude -p "$(pnpm agent:next)"`.
3. Before closing: `pnpm agent:verify` and `pnpm agent:acceptance TASK-xxx`.

No Cursor hooks required — the loop is driven by the program file + CLI verify.

## Repository layout (after install)

```text
your-repo/
├── .agent-loop/
│   ├── queue.json
│   ├── scratchpad.md
│   └── autostart          # optional empty file
├── specs/agent-tasks/
│   ├── _template.md
│   └── TASK-001.md
├── scripts/agent/
├── tools/agent-gui/       # optional
├── agent-loop.config.json
├── .cursor/hooks/         # optional (Cursor)
├── .cursor/skills/        # optional — uninstall, update
└── CLAUDE.md              # optional snippet appended
```

## AI install prompt

Copy the block below into **Cursor Agent**, **Claude Code**, or any coding agent opened **in your target repository**. The agent should install the kit and configure your project end-to-end.

````markdown
You are installing **Agent Loop** into this repository.

## Goal

Add a Karpathy-style agent loop: one program file per task, a queue, automatic verify, optional web GUI. Configure the kit for the coding agent backend the user chooses (**Cursor CLI** or **Claude Code CLI**).

## Steps

0. **Detect installed coding agent CLIs** (always do this first — before cloning or installing anything):
   - Run both checks (exit code ≠ 0 is OK — it means not installed):
     ```bash
     agent --version
     claude --version
     ```
   - Summarize for the user:
     - **Cursor CLI** (`agent`): installed / not installed
     - **Claude Code CLI** (`claude`): installed / not installed
   - **Ask the user which backend to use** — do not guess:
     - **Both installed** → ask explicitly: `cursor` or `claude`?
     - **Only one installed** → propose that one and ask for confirmation; offer install link for the other if they prefer it
     - **Neither installed** → ask which they want to use, share install links ([Cursor CLI](https://cursor.com/docs/cli/overview), [Claude Code](https://code.claude.com/docs/en/setup)), and wait until at least the chosen CLI is installed before continuing
   - Record the choice as `AGENT_BACKEND=cursor` or `AGENT_BACKEND=claude` (document in README/AGENTS.md; optional file `.agent-loop/backend` with a single line `cursor` or `claude`).

1. **Clone the kit** (if not already present) into a **writable temp folder for this OS** — do not hardcode `/tmp`:
   - Resolve a path, e.g. with Node (works everywhere):
     ```bash
     node -e "const {join}=require('node:path'); const {tmpdir}=require('node:os'); console.log(join(tmpdir(), 'agent-loop'))"
     ```
   - Clone into that folder (replace `<KIT_DIR>` with the printed path):
     ```bash
     git clone https://github.com/ciroaurelio22/AgentLoop.git "<KIT_DIR>"
     ```
   - Examples if you prefer shell variables:
     - Linux / macOS: `"$TMPDIR/agent-loop"` or `/tmp/agent-loop`
     - Windows PowerShell: `"$env:TEMP\agent-loop"`

2. **Run the installer** from the target repo root (forward slashes in the Node path work on Windows too):
   - Use the backend chosen in step 0; always include `--gui`:
     ```bash
     # cursor
     node "<KIT_DIR>/bin/install.mjs" --target . --cursor --gui

     # claude
     node "<KIT_DIR>/bin/install.mjs" --target . --claude --gui

     # or both adapters if the user wants flexibility
     node "<KIT_DIR>/bin/install.mjs" --target . --all
     ```

3. **Enable autostart** (required for Agent Console GUI + session hooks):
   ```bash
   node -e "require('node:fs').mkdirSync('.agent-loop',{recursive:true}); require('node:fs').writeFileSync('.agent-loop/autostart','')"
   ```

4. **Detect package manager** — inspect the repo (do not assume pnpm):
   ```bash
   node scripts/agent/detect-pm.mjs
   ```
   - Lockfiles: `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `package-lock.json` → npm, `bun.lockb` → bun
   - Leave `verify.packageManager` as **`"auto"`** in `agent-loop.config.json` unless the repo requires a pinned value
   - Set `verify.packageManager` to what this repo uses only when auto-detection is wrong
   - Map path prefixes to package names in `verify.packages`, or use `"mode": "root"` for single-package repos
   - Set `defaults.baseBranch` to this repo's main branch (`main` or `master`)

5. **Adapt the program template** — edit `specs/agent-tasks/_template.md`:
   - Branch naming (`agent/{{BRANCH_SLUG}}` → PR on correct base branch).
   - Replace example verify commands with this repo's real commands.

6. **Install the chosen CLI** (if step 0 reported it missing):
   - For **Cursor** (`AGENT_BACKEND=cursor`): follow [Cursor CLI docs](https://cursor.com/docs/cli/overview), then `agent login`
   - For **Claude** (`AGENT_BACKEND=claude`): follow [Claude Code setup](https://code.claude.com/docs/en/setup), then authenticate
   - Re-run `agent --version` or `claude --version` and confirm the chosen backend works before smoke tests.

7. **Merge package.json scripts** — confirm these exist:
   - `agent:init`, `agent:next`, `agent:verify`, `agent:acceptance`, `agent:status`, `agent:gui`, `agent:gui:ensure`, `agent:update`, `agent:check-update`

8. **Confirm Cursor skills** (installed with `--cursor` / `--all`):
   - `.cursor/skills/uninstall/SKILL.md` — remove agent-loop from this repo
   - `.cursor/skills/update/SKILL.md` — pull latest kit from GitHub without losing queue/tasks

9. **Smoke test** (with the backend chosen in step 0):
   ```bash
   pnpm agent:init TASK-001 "Agent loop smoke test"
   pnpm agent:status
   pnpm agent:next --json
   ```

10. **Document for the team** — add a short "Agent loop" section to README or AGENTS.md with:
   - Chosen backend and how to set `AGENT_BACKEND=cursor|claude` (GUI + `run-agent.mjs`)
   - How to create a task (`pnpm agent:init`)
   - How to start the agent (`pnpm agent:next` or GUI)

## Constraints

- Do not merge autonomously.
- Do not hardcode secrets.
- Do not hardcode `/tmp` or other OS-specific paths — use `os.tmpdir()` or the shell temp variable for this machine.
- Do not assume `cursor` or `claude` — always detect CLIs in step 0 and ask the user when needed.
- Keep diffs minimal — only add agent-loop files and config.
- If `lint` / `typecheck` / `test` scripts are missing at root, document what the user must add.

## Done when

- [ ] Step 0 completed: CLIs detected and user chose `AGENT_BACKEND` (`cursor` or `claude`)
- [ ] `.agent-loop/`, `scripts/agent/`, `specs/agent-tasks/` exist
- [ ] `pnpm agent:status` runs without error
- [ ] `agent-loop.config.json` matches this repo layout
- [ ] Chosen CLI (`agent` or `claude`) is installed and authenticated
- [ ] `.cursor/skills/uninstall` and `.cursor/skills/update` exist (Cursor projects)
- [ ] Optional: `pnpm agent:gui` starts on port 9477
````
## Update / uninstall

**Update** from GitHub (keeps queue and task programs):

```bash
pnpm agent:update
```

Or ask Cursor Agent to use the **agent-loop-update** skill.

**Uninstall**:

```bash
node /path/to/AgentLoop/bin/uninstall.mjs --target .
node /path/to/AgentLoop/bin/uninstall.mjs --target . --keep-data   # keep queue + programs
```

Or ask Cursor Agent to use the **agent-loop-uninstall** skill.

### Update check (automatic, throttled)

The hook `agent-update-check` runs on Agent session start but hits GitHub **at most once every 7 days** (not every session). It compares `.agent-loop/kit-version` with [`VERSION`](https://github.com/ciroaurelio22/AgentLoop/blob/master/VERSION) on GitHub.

```bash
pnpm agent:check-update          # respects interval
pnpm agent:check-update --force  # check now
pnpm agent:check-update --snooze 14
pnpm agent:check-update --dismiss
```

Configure in `agent-loop.config.json`:

```json
"updateCheck": {
  "enabled": true,
  "intervalDays": 7,
  "branch": "master",
  "repo": "ciroaurelio22/AgentLoop"
}
```

When you release a new kit version, bump the root **`VERSION`** file in this repo.

## Contributing

This kit is extracted from production use. PRs welcome for:

- Additional agent adapters (Codex, OpenCode, etc.)
- Neutral `AGENT_LOOP_DIR` without legacy `.cursor/agent-loop` fallback
- Improved monorepo auto-detection in `verify-touched.mjs`

## License

MIT — see [LICENSE](LICENSE).

## Star history

Grafico aggiornato in tempo reale via [Star History](https://star-history.com) (dati GitHub).

<a href="https://www.star-history.com/#ciroaurelio22/AgentLoop&type=date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ciroaurelio22/AgentLoop&type=date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ciroaurelio22/AgentLoop&type=date" />
    <img alt="Andamento star GitHub — AgentLoop" src="https://api.star-history.com/chart?repos=ciroaurelio22/AgentLoop&type=date" />
  </picture>
</a>
