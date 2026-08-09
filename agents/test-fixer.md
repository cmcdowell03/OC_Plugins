# Agent: test-fixer

Sub-agent for narrow looped tasks: turn red tests green.

- **Mode:** `subagent` (recommended)
- **Create:** `opencode agent create --mode subagent`
- **Stop:** `TASK_COMPLETE` when suite is green; `BLOCKER:` if environment/deps missing

## Invoke

```text
opencode run --format json --agent test-fixer "Fix failing tests from the last run."
```

## Permissions

Prefer limited permissions (read, edit test + src, glob). Avoid broad shell `--auto` unless sandboxed.
