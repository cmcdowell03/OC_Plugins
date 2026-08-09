# OC_Plugins

Workspace for **OpenCode** plugin creation, outer-loop orchestration, and multi-agent automation.

**Charts:** demo data is in [`data/quarterly_revenue.json`](data/quarterly_revenue.json).<br>
Agents: read that file → call tool **`create_inline_chart`**. See [`CHART.md`](CHART.md) and [`AGENTS.md`](AGENTS.md).

OpenCode (SST/Anomaly open-source terminal AI coding agent) is built for scripting, headless runs, session continuation, and multi-agent workflows. There is **no native `loop` command** — by design. External control is more flexible and safer for harnesses like Cursor + Codex + OpenCode coordination.

## Repo layout

```
OC_Plugins/
├── README.md                 # this file
├── AGENTS.md                 # project memory for OpenCode (/init style)
├── docs/
│   ├── looping-opencode.md         # core loop mechanisms
│   ├── advanced-agentic-loops.md   # Planner → OpenCode → Reviewer
│   └── tips-and-gotchas.md
├── agents/                   # reusable agent briefs (refactor, test-fixer, …)
├── plugins/
│   ├── _template/            # copy this to start a new plugin
│   ├── code-improver/        # example iterative agent plugin
│   ├── inline-chart/          # cross-host chart envelope (Python + HTML)
│   ├── opencode-alg/          # Agents + Loops + Graphs orchestration runtime
│   └── opencode-inline-chart/ # OpenCode: in-chat PNG attachment + VL/ECharts specs
├── examples/
│   ├── bash/                 # iterative refinement loops
│   ├── powershell/           # Windows-native loops
│   └── python/               # simple + multi-agent harnesses
├── harness/                  # shared orchestration helpers
└── scripts/                  # one-shot utilities (serve, doctor, etc.)
```

## Core CLI building blocks

| Mechanism | Purpose |
|-----------|---------|
| `opencode run [prompt]` | Non-interactive / headless run — process, print, exit |
| `--continue` / `-c`, `--session <id>`, `--fork` | Chain iterations with preserved context |
| `opencode serve` + `--attach` | Warm server; tight loops without cold start |
| `opencode agent create` + `--agent` | Reusable agents (prompt, permissions, primary/subagent) |
| `--format json` | Machine-readable events for control flow |
| `--auto` | Auto-approve permissions (use carefully) |
| `--file`, `--model`, `--thinking` | Inputs, model override, reasoning controls |
| `AGENTS.md` + local SQLite sessions | Stable project memory across iterations |
| HTTP / OpenAPI via `opencode serve` | Programmatic control without subprocess |

## Quick start

```powershell
# From the directory containing this checkout
Set-Location .\OC_Plugins

# Optional: warm server (Terminal 1)
opencode serve --port 4096

# Run iterative example (Terminal 2)
.\examples\powershell\iterative-refine.ps1 -MaxIter 5 -Attach "http://localhost:4096"

# Or Python harness
python .\examples\python\simple_loop.py
python .\examples\python\multi_agent_loop.py
python .\examples\python\loop_harness.py --max-iter 5
```

## Advanced pattern (your workflow)

Treat OpenCode as **one callable node**:

```text
Planner → OpenCode (implement) → Tester/Reviewer → shared memory → Planner
```

- JSON + `"TASK_COMPLETE" in str(resp)` for branching / early exit
- Shared files / Redis / MemSync / SHKG for handoff
- Sub-agents: `test-fixer`, `doc-updater`, `performance-tuner`
- Limited permissions; local Ollama/vLLM for tight private loops

Details: [docs/advanced-agentic-loops.md](docs/advanced-agentic-loops.md)

## Flagship plugin: Agents + Loops + Graphs

[`plugins/opencode-alg`](plugins/opencode-alg) provides a typed DAG executor for bounded, durable multi-agent runs, including fresh-child checking, model snapshots, and audited run ownership.

From the repository root, install dependencies reproducibly, run its complete check gate, and register it with OpenCode:

```powershell
Set-Location .\plugins\opencode-alg
bun install --frozen-lockfile
bun run check
.\scripts\install.ps1
```

On POSIX systems, use `./scripts/install.sh` for the registration step. **Quit and restart OpenCode after installation** so it loads the plugin and configuration changes.

## Flagship plugin: inline charts

Interactive charts **in the chat thread** via `create_inline_chart` (declarative ECharts/Vega-Lite, ASCII TUI fallback).

```powershell
cd plugins\inline-chart
python .\src\chart_tool.py --demo --ascii
.\examples\render_demo.ps1
```

Design: [docs/inline-chart-plugin.md](docs/inline-chart-plugin.md) · Code: [plugins/inline-chart](plugins/inline-chart)

### Grok Build chat rendering

**Today (no TUI widget API):** Grok Build shows charts as **PNG** via skill **`chart-in-chat`**.<br>
Run `render_chart.py` → agent `read_file`s the PNG → image appears inline. Slash: `/chart-in-chat`.

**True interactive inline TUI** needs a **core Grok Build** change (plugins cannot inject widgets).<br>
See [docs/grok-build-inline-charts-rfc.md](docs/grok-build-inline-charts-rfc.md).

## Creating a new plugin

```powershell
.\scripts\new-plugin.ps1 -Name my-plugin
# → plugins\my-plugin\ with manifest + README + agent prompt stubs
```

## Safety notes

- Prefer outer loops over long unbounded agent autonomy.
- Use completion markers (e.g. `TASK_COMPLETE`) and max-iteration caps.
- `--auto` skips permission prompts — restrict to trusted repos.
- Keep secrets out of prompts and JSON logs.
