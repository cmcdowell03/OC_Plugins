# my-plugin

> Replace this with your plugin name and purpose.

## What it does

- …

## Agent

- Name: `my-plugin-agent`
- Mode: `primary` (or `subagent`)
- Prompt: `prompts/system.md`

## Loop usage

```powershell
# Warm server (optional)
opencode serve --port 4096

# Single shot
opencode run --agent my-plugin-agent --format json "Your task here"

# Outer loop
..\..\examples\powershell\iterative-refine.ps1 `
  -Agent my-plugin-agent `
  -Attach http://localhost:4096 `
  -MaxIter 10
```

## Completion protocol

When the task is done, the agent must print:

```text
TASK_COMPLETE: <one-line summary>
```

## Checklist

- [ ] Fill `plugin.json`
- [ ] Write `prompts/system.md`
- [ ] Smoke-test with `opencode run --format json`
- [ ] Document permissions and model prefs
