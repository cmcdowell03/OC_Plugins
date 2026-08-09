# Agent: performance-tuner

Sub-agent: profile-informed performance passes.

- **Mode:** `subagent`
- **Create:** `opencode agent create --mode subagent`
- **Stop:** `TASK_COMPLETE` after measured or reasoned improvement; no speculative rewrites

## Invoke

```text
opencode run --format json --agent performance-tuner "Tighten the hot path in the last profile."
```
