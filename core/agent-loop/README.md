# Agent loop

State directory for the autonomous task queue (`.agent-loop/` in your repo).

| File | Role |
|------|------|
| `queue.json` | Task queue (id, status, priority, program path) |
| `scratchpad.md` | Agent progress; line `DONE` closes the loop |
| `state.json` | Active task (auto-managed) |
| `autostart` | Empty file — bootstrap on new IDE sessions (optional) |

Commands: see root `README.md` and `specs/agent-tasks/README.md`.
