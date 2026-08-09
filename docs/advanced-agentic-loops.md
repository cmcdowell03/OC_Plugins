# Advanced / Agentic Looping Patterns

Fits workflows that already coordinate **Cursor / Codex / OpenCode** and custom harnesses (Cline rules, shared KV/memory, supervisor patterns).

OpenCode is strongest as **one callable node** in a larger loop — not as the only process that owns control flow.

## Core idea

```text
while not goal_achieved:
    plan = supervisor_or_planner_agent.decide_next_step(context)
    result = opencode_run(plan.prompt, session=plan.session, agent=plan.agent)
    update_shared_memory(result)
    if result contains completion signal or tests pass:
        break
    elif max_iterations or cost_budget exceeded:
        escalate to human / other agent
```

This is more powerful than a dumb `while true` because your **outer harness** (or a lightweight supervisor) controls the intelligence of the loop.

## Patterns that fit this workflow

### 1. OpenCode as one node in a multi-agent pipeline

```text
Planner → OpenCode (implement) → Tester / Reviewer → back to Planner
```

| Node | Role |
|------|------|
| **Planner / supervisor** | Decides next step, picks agent, bounds budget |
| **OpenCode** | Implements (`opencode run --agent …`) |
| **Tester / Reviewer** | Runs tests, code review, policy checks |
| **Shared memory** | Files, Redis Streams, MemSync, SHKG, etc. |

See `examples/python/multi_agent_loop.py` for a skeleton.

### 2. JSON-driven control flow

Use `--format json` + parsing for:

- conditional branching (`if resp.get("needs_tests")`)
- early exit (`"TASK_COMPLETE" in str(resp)`)
- session chaining (`session = resp.get("session_id")`)

### 3. Shared state handoff

Between OpenCode iterations and other agents, hand off via:

- shared files under a `runs/` or artifact dir
- Redis Streams / queues
- your existing MemSync / SHKG / KV layer

OpenCode does not need to own the memory fabric — write results out, let the supervisor read them next tick.

### 4. Specialized sub-agents

```bash
opencode agent create --mode subagent
```

Narrow looped tasks work well as sub-agents:

| Agent | Job |
|-------|-----|
| `test-fixer` | Red tests → green |
| `doc-updater` | Keep README/API docs aligned |
| `performance-tuner` | Profile + tighten hotspots |
| `refactor-agent` | Structural cleanup (see `agents/refactor-agent.md`) |

Invoke with `--agent <name>` inside the outer loop.

### 5. Safety

- Limit permissions: `--permissions read,edit,glob` (or your install’s equivalent)
- Use `--auto` **judiciously** in loops (easy to over-apply edits)
- Cap `max_iterations`, wall-clock, and (if paid APIs) cost budget
- Escalate to human / other agent on budget exceed or repeated blockers

### 6. Local models

vLLM / Ollama on a local GPU (e.g. RTX 3090) work well for tight loops:

- fast iteration
- private
- no cloud rate limits

Point with `--model ollama/...` or your vLLM route.

## Minimal multi-agent loop (Python)

```python
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

## Supervisor pattern (high level)

```python
while not goal_achieved:
    plan = supervisor.decide_next_step(context)   # planner node
    result = opencode_run(
        plan.prompt,
        session=plan.session,
        agent=plan.agent,   # e.g. implementer, test-fixer
    )
    update_shared_memory(result)                  # files / Redis / MemSync
    if completion_signal(result) or tests_pass():
        break
    if max_iterations_or_budget_exceeded():
        escalate_to_human_or_other_agent()
```

## Tips & gotchas

See `docs/tips-and-gotchas.md`.

## Related code

| Path | Purpose |
|------|---------|
| `examples/python/simple_loop.py` | Single-agent session loop |
| `examples/python/multi_agent_loop.py` | Planner → OpenCode → reviewer skeleton |
| `harness/opencode_client.py` | Reusable CLI wrapper |
| `agents/*.md` | Agent briefs for looped roles |
