# Core Mechanisms for Looping OpenCode

OpenCode is designed for scripting, automation, headless execution, session continuation, and multi-agent workflows. Wrapping it in loops is intentional and supported — whether for simple batch tasks or multi-agent systems (e.g. Cursor + Codex + OpenCode).

## Key features that enable loops

### 1. `opencode run [prompt]`

Non-interactive / headless mode. Processes the prompt, outputs the result (or JSON events), and exits. Perfect for scripting.

```bash
opencode run "Summarize recent git changes" --format json
```

### 2. Session control

| Flag | Role |
|------|------|
| `--continue` / `-c` | Continue the latest (or given) session |
| `--session <id>` | Target a specific session |
| `--fork` | Branch session state for alternate paths |

Use these to chain iterations while preserving context.

### 3. `opencode serve` + `--attach`

Start a headless server once, then make fast repeated calls without cold-start overhead.

```bash
# Terminal 1
opencode serve --port 4096

# Terminal 2
opencode run --attach http://localhost:4096 --format json "Next step..."
```

Ideal for tight loops.

### 4. Agents

```bash
opencode agent create   # define reusable agents
opencode run --agent code-improver "..."
```

Agents carry custom prompts, permissions, and modes (`primary` / `subagent`).

### 5. Other useful flags

| Flag | Use |
|------|-----|
| `--format json` | Machine-readable output for parsing decisions |
| `--auto` | Auto-approve permissions (careful) |
| `--file` | Attach file context |
| `--model` | Override model |
| `--thinking` | Reasoning controls (when supported) |

### 6. Project memory

- **`AGENTS.md`** (via `/init` or hand-written) — stable repo instructions.
- **Local SQLite sessions** — continuity across loop iterations.

### 7. Server API

When `opencode serve` is running, HTTP/OpenAPI endpoints allow programmatic calls without spawning a new CLI process each time.

## Design principle

**No native `loop` command** (intentionally). External control is more flexible and safer. Your harness owns:

- iteration count
- stop conditions
- session lifecycle
- logging / artifacts
- multi-agent handoffs

## Patterns

### A. Session-chained refinement

1. First call: `opencode run --format json "..."`.
2. Capture `session_id` from JSON.
3. Later calls: `opencode run --continue --session $ID --format json "..."`.
4. Stop on marker or tests green.

### B. Warm-server tight loop

1. `opencode serve --port 4096`.
2. Many `opencode run --attach http://localhost:4096 ...`.
3. Lower latency; good for agent harnesses.

### C. Multi-agent pipeline

1. Planner agent produces a task list (JSON).
2. Worker agent(s) execute tasks in a loop.
3. Reviewer agent gates merge / `TASK_COMPLETE`.

### D. File-watch driven

Outer loop sleeps or waits on filesystem events, then invokes OpenCode with a prompt that includes the diff or failing test output.

## Completion protocol (recommended)

Instruct the agent to end successful work with a parseable line:

```text
TASK_COMPLETE: <one-line summary>
```

Harnesses grep/JSON-parse for this marker. Always also set `MAX_ITER`.

## Python sketch

```python
import subprocess, json, time

def call_opencode(prompt: str, session_id: str = None, agent: str = None) -> dict:
    cmd = ["opencode", "run", "--format", "json"]
    if session_id:
        cmd += ["--continue", "--session", session_id]
    if agent:
        cmd += ["--agent", agent]
    cmd += [prompt]

    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout) if result.stdout else {}

# Example loop in your multi-agent system
session = None
for i in range(20):
    resp = call_opencode(
        "Analyze recent changes and propose the next improvement step. "
        "Output TASK_COMPLETE when done or a clear blocker.",
        session_id=session,
        agent="refactor-agent",
    )
    session = resp.get("session_id")
    if "TASK_COMPLETE" in str(resp):
        break
    # Feed output into your SHKG / MemSync / reviewer agent, etc.
    time.sleep(1)
```

Full files: `examples/python/simple_loop.py`, `examples/python/loop_harness.py`.

## Advanced patterns

See **[advanced-agentic-loops.md](./advanced-agentic-loops.md)** and **[tips-and-gotchas.md](./tips-and-gotchas.md)**.

## Related examples

- `examples/bash/iterative-refine.sh`
- `examples/powershell/iterative-refine.ps1`
- `examples/python/simple_loop.py`
- `examples/python/multi_agent_loop.py`
- `examples/python/loop_harness.py`
- `harness/opencode_client.py`
