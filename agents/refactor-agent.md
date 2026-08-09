# Agent: refactor-agent

Multi-agent loop worker used by `examples/python/simple_loop.py`.

- **Mode:** primary (or subagent under a planner)
- **Loop:** `--continue --session <id>` across iterations
- **Stop:** emit `TASK_COMPLETE` when done, or a clear `BLOCKER: ...` line

## Invoke

```text
opencode run --format json --agent refactor-agent "Analyze recent changes..."
```

With session:

```text
opencode run --format json --continue --session <id> --agent refactor-agent "..."
```

## Prompt sketch

Analyze recent changes and propose the next improvement step.
Output TASK_COMPLETE when done or a clear blocker.
