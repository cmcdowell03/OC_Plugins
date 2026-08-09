# Agent: doc-updater

Sub-agent: keep README / API docs aligned with code changes.

- **Mode:** `subagent`
- **Create:** `opencode agent create --mode subagent`
- **Stop:** `TASK_COMPLETE` when docs match behavior

## Invoke

```text
opencode run --format json --agent doc-updater "Update docs for the latest public API changes."
```
