# Agent: code-improver

Canonical copy of the code-improver agent brief. Plugin package: `plugins/code-improver/`.

- **Mode:** primary
- **Loop:** session continue + `TASK_COMPLETE` marker
- **Prompt file:** `plugins/code-improver/prompts/system.md`

## Invoke

```text
opencode run --agent code-improver --format json "<task>"
```

With warm server:

```text
opencode run --attach http://localhost:4096 --agent code-improver --format json "<task>"
```
