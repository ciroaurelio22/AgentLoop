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
git clone https://github.com/SynapseX/AgentLoop.git
cd your-project

node /path/to/AgentLoop/bin/install.mjs --target . --all
touch .agent-loop/autostart
pnpm agent:init TASK-001 "My first task"
pnpm agent:next
```

Flags:

- `--cursor` — copy Cursor hooks to `.cursor/hooks/`
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
    "packageManager": "pnpm",
    "mode": "root",
    "packages": {
      "apps/web/": "@myapp/web",
      "apps/api/": "@myapp/api"
    }
  }
}
```

- **`mode: "root"`** — runs `pnpm run lint` etc. at repo root (single-package repos).
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
2. Create empty file `.agent-loop/autostart` to enable bootstrap in local IDE sessions.
3. `stop` hook runs verify + enforces acceptance before accepting `DONE` in scratchpad.

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
└── CLAUDE.md              # optional snippet appended
```

## AI install prompt

Copy the block below into **Cursor Agent**, **Claude Code**, or any coding agent opened **in your target repository**. The agent should install the kit and configure your project end-to-end.

````markdown
You are installing **Agent Loop** into this repository.

## Goal

Add a Karpathy-style agent loop: one program file per task, a queue, automatic verify, optional web GUI. Must support **both** Cursor CLI (`agent`) and Claude Code CLI (`claude`).

## Steps

1. **Clone the kit** (if not already present):
   ```bash
   git clone https://github.com/SynapseX/AgentLoop.git /tmp/agent-loop
   ```

2. **Run the installer** from the repo root:
   ```bash
   node /tmp/agent-loop/bin/install.mjs --target . --all
   ```

3. **Enable autostart** (required for Agent Console GUI):
   ```bash
   mkdir -p .agent-loop && touch .agent-loop/autostart
   ```

4. **Configure verify** — create or update `agent-loop.config.json`:
   - Detect monorepo layout (`apps/*`, `packages/*`) or single package.
   - Set `verify.packageManager` to what this repo uses (pnpm/npm/yarn).
   - Map path prefixes to package names in `verify.packages`, or use `"mode": "root"` for single-package repos.
   - Set `defaults.baseBranch` to this repo's main branch (`main` or `master`).

5. **Adapt the program template** — edit `specs/agent-tasks/_template.md`:
   - Branch naming (`agent/{{BRANCH_SLUG}}` → PR on correct base branch).
   - Replace example verify commands with this repo's real commands.

6. **Install a coding agent CLI** (do both if possible, report what succeeded):

   **Cursor CLI**
   ```bash
   # Follow https://cursor.com/docs/cli/overview
   agent --version || echo "Install Cursor CLI and run: agent login"
   ```

   **Claude Code CLI**
   ```bash
   # Follow https://code.claude.com/docs/en/setup
   claude --version || echo "Install Claude Code CLI and authenticate"
   ```

7. **Merge package.json scripts** — confirm these exist:
   - `agent:init`, `agent:next`, `agent:verify`, `agent:acceptance`, `agent:status`, `agent:gui`

8. **Smoke test**:
   ```bash
   pnpm agent:init TASK-001 "Agent loop smoke test"
   pnpm agent:status
   pnpm agent:next --json
   ```

9. **Document for the team** — add a short "Agent loop" section to README or AGENTS.md with:
   - How to create a task (`pnpm agent:init`)
   - How to start the agent (`pnpm agent:next` or GUI)
   - `AGENT_BACKEND=cursor|claude` for the GUI

## Constraints

- Do not merge autonomously.
- Do not hardcode secrets.
- Keep diffs minimal — only add agent-loop files and config.
- If `lint` / `typecheck` / `test` scripts are missing at root, document what the user must add.

## Done when

- [ ] `.agent-loop/`, `scripts/agent/`, `specs/agent-tasks/` exist
- [ ] `pnpm agent:status` runs without error
- [ ] `agent-loop.config.json` matches this repo layout
- [ ] At least one CLI (`agent` or `claude`) is installed or install instructions are documented
- [ ] Optional: `pnpm agent:gui` starts on port 9477
````
## Contributing

This kit is extracted from production use. PRs welcome for:

- Additional agent adapters (Codex, OpenCode, etc.)
- Neutral `AGENT_LOOP_DIR` without legacy `.cursor/agent-loop` fallback
- Improved monorepo auto-detection in `verify-touched.mjs`

## License

MIT — see [LICENSE](LICENSE).
