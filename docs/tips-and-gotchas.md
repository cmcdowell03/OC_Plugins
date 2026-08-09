# Tips & Gotchas — OpenCode outer loops

## Tips

1. **Bound every loop** — `max_iter`, sleep/backoff, and a completion marker (`TASK_COMPLETE`).
2. **State management** — use `--continue` / session IDs or attach files/`AGENTS.md` for context. Local SQLite keeps history.
3. **Performance** — `opencode serve` + `--attach` avoids repeated startup cost.
4. **Parsing output** — always use `--format json` when looping so you can reliably detect completion, errors, or next actions.
5. **Permissions & safety** — configure agents carefully or use `--auto` only in trusted loops. OpenCode has a permissions engine.
6. **Local models** — excellent fit (Ollama/vLLM supported); private, fast, no rate limits.
7. **Debugging** — open the TUI on the same project/session for inspection while harnesses run headless.
8. **Specialized agents** — `test-fixer`, `doc-updater`, `performance-tuner`, chart agents.
9. **Outer harness owns intelligence** — OpenCode implements; supervisor decides next step.
10. **Log every iteration** — write `runs/iteration_NNN.json` for replay and debugging.

## Gotchas

1. **No native `loop` command** — by design; do not wait for one.
2. **`--auto` is sharp** — fine for sandboxes; dangerous on monorepos without review.
3. **Session ID field names** — may be `session_id`, `sessionID`, or nested; use `.get` + `str(resp)` fallbacks.
4. **Empty stdout** — treat as failure; check stderr and return code.
5. **Cold start cost** — spawning `opencode run` every tick is slow; use `serve`/`--attach`.
6. **Permission prompts hang headless runs** — pass explicit permissions or careful `--auto`.
7. **Don’t put secrets in prompts or JSON logs**.
8. **OneDrive / synced paths** — fine for this repo; avoid locking SQLite sessions on flaky sync if OpenCode stores DB there.
9. **Marker typos** — always `TASK_COMPLETE` (not `ASK_COMPLETE`).
10. **Budget blindness** — track iterations *and* wall time; escalate instead of infinite refine.
11. **Clipboard issues** — unrelated to looping; known on Linux Wayland/macOS terminals — workarounds exist if needed.

## Bottom line

OpenCode was built with scripting and automation as first-class use cases. Put it into simple loops today with `opencode run`, and it slots cleanly into sophisticated multi-agent / harness systems.

## Completion protocol (canonical)

Agent final line when done:

```text
TASK_COMPLETE: <one-line summary>
```

When blocked:

```text
BLOCKER: <what is needed>
```
