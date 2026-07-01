## Agent loop

Autonomous task system: one **program** per task (`specs/agent-tasks/<ID>.md`), queue in `.agent-loop/`.

### Agent duties

1. Read the full program file — source of truth.
2. Mark `- [x]` on every **Acceptance criteria** item.
3. Update `.agent-loop/scratchpad.md` with progress.
4. Run verify: `npm run agent:verify` (or your package manager) and `npm run agent:acceptance <ID>`.
5. Write `DONE` in scratchpad only when acceptance is complete and verify is green.
6. Never merge autonomously.

### Bootstrap a session

```bash
pnpm agent:next
```

Or inject context JSON:

```bash
node scripts/agent/next-task.mjs --context
```

Set `AGENT_LOOP=1` to force loop mode without the `autostart` file.

### CLI reference

| Command | Purpose |
| ------- | ------- |
| `pnpm agent:init TASK-001 "Title"` | Create program + enqueue |
| `pnpm agent:register TASK-001` | Enqueue existing program |
| `pnpm agent:next` | Print / inject active task prompt |
| `pnpm agent:status` | Queue summary |
| `pnpm agent:verify` | Lint/typecheck/test touched packages |
| `pnpm agent:acceptance TASK-001` | Check program checklist |
| `pnpm agent:gui` | Web console (optional) |
