# code-improver

Example OpenCode plugin / agent for **iterative code improvement** in an outer loop.

## Agent

- **Name:** `code-improver`
- **Prompt:** `prompts/system.md`

## Typical loop

```powershell
# Terminal 1
opencode serve --port 4096

# Terminal 2
opencode run --attach http://localhost:4096 `
  --format json `
  --agent code-improver `
  "Refactor the selected function for better error handling"

# Or full iterative harness
..\..\examples\powershell\iterative-refine.ps1 `
  -Agent code-improver `
  -Attach http://localhost:4096 `
  -MaxIter 8
```

```bash
# Persistent server loop (recommended for frequent calls)
opencode run --attach http://localhost:4096 \
  --format json \
  --agent code-improver \
  "Refactor the selected function for better error handling" \
  > "iteration_$(date +%s).json"
```

## Registering the agent with OpenCode

Depending on your OpenCode version, register via:

```bash
opencode agent create
```

…or point config at `prompts/system.md`. Adjust paths to match your install.

## Completion

Agent ends successful work with:

```text
TASK_COMPLETE: <summary>
```
