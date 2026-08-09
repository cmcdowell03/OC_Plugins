# inline-chart

**High-leverage OpenCode / harness plugin:** render interactive charts **inline in chat** via `create_inline_chart`.

No more “here’s matplotlib code, go run it” or static PNGs that lose context. The agent emits a structured chart envelope; the host mounts ECharts (web/IDE) or ASCII (TUI).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Tool layer (LLM calls create_inline_chart)               │
│    schemas/create_inline_chart.json                         │
│    src/chart_tool.py  →  declarative ECharts / Vega-Lite    │
└────────────────────────────┬────────────────────────────────┘
                             │ envelope type:"chart"
┌────────────────────────────▼────────────────────────────────┐
│ 2. Rendering layer                                          │
│    Web/IDE:  renderers/echarts_viewer.html                  │
│    TUI:      ASCII sparkline (chart_tool.render_ascii)      │
│    Optional: Kitty/WezTerm image / local webview            │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ 3. Extension points                                         │
│    OpenCode tool: opencode/create_inline_chart.ts           │
│    MCP/harness:   mcp/server.py                             │
│    Agent prompt:  prompts/system.md                         │
└─────────────────────────────────────────────────────────────┘
```

## Tool schema (summary)

| Field | Required | Notes |
|-------|----------|--------|
| `chart_type` | yes | `line` `bar` `scatter` `pie` `area` `heatmap` `candlestick` `boxplot` |
| `data` | yes | Array of objects |
| `title` | | |
| `x_field` / `y_field` | | Inferred if omitted |
| `series_field` | | Multi-series grouping |
| `options.*` | | legend, theme, MA, trendline, annotations, height, renderer |

**Required:** `chart_type`, `data`.

## Return envelope

```json
{
  "type": "chart",
  "renderer": "echarts",
  "spec": { },
  "interactive": true,
  "meta": {
    "data_points": 42,
    "generated_at": "..."
  }
}
```

Declarative by design — **no arbitrary code execution**. Power mode (Polars/DuckDB → stats → spec) can wrap this later.

## Quick start

```powershell
cd plugins\inline-chart

# Demo: quarterly revenue + MA + Q3 annotation
python .\src\chart_tool.py --demo --ascii

# From example file + open HTML viewer
.\examples\render_demo.ps1
```

```powershell
# Pipe a request
Get-Content .\examples\quarterly_revenue.json | python .\src\chart_tool.py
```

## OpenCode registration

1. Copy tool into place:

```powershell
Copy-Item .\opencode\create_inline_chart.ts `
  $env:USERPROFILE\.config\opencode\tools\create_inline_chart.ts
```

Or project-local:

```text
.opencode/tools/create_inline_chart.ts
```

2. Point at the Python builder if needed:

```powershell
$env:OPENCODE_INLINE_CHART_PY = (Resolve-Path .\src\chart_tool.py).Path
```

3. Add to agent instructions (or use `prompts/system.md` / `chart-agent`):

> Prefer `create_inline_chart` for any visualization request.

See https://opencode.ai/docs/custom-tools/

## End-to-end conversation

**User:** Plot quarterly revenue with a 3-month moving average and highlight the Q3 spike.

**Agent:** calls `create_inline_chart` with data + `moving_average: 3` + annotation on Q3.

**Host:** sees `type: "chart"` → mounts ECharts bubble (or ASCII in TUI).

**User:** Change to bar chart / zoom Q2–Q4 / add error bars → another tool call, same thread.

## Host integration (renderer)

When a message part / tool result parses as JSON with `type === "chart"`:

1. Web: load `renderers/echarts_viewer.html` and `postMessage(envelope)` or set `window.CHART_ENVELOPE`.
2. Listen for `chart_click` events to feed drill-downs back into the agent.
3. TUI: show `render_ascii(envelope)` or terminal image protocol later.

## Why this wins

- **Conversational + visual** — chart lives in the thread
- **Interactive** — tooltips, zoom, export, click → agent
- **Safe** — Vega-Lite / ECharts specs, not random Python
- **Local-first** — works with Ollama/vLLM and multi-agent harnesses
- **Graceful degrade** — ASCII in OpenCode TUI

## Layout

```
inline-chart/
├── plugin.json
├── README.md
├── schemas/create_inline_chart.json
├── src/chart_tool.py
├── renderers/echarts_viewer.html
├── opencode/create_inline_chart.ts
├── mcp/server.py
├── prompts/system.md
└── examples/
    ├── quarterly_revenue.json
    └── render_demo.ps1
```

## Grok Build chat (inline PNG)

Interactive ECharts is for OpenCode/web hosts. **Grok Build chat** displays charts by rendering a **PNG** and having the agent `read_file` it.

User-level skill (auto-invoked for plot/chart requests):

```text
~/.grok/skills/chart-in-chat/
```

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe" `
  "$env:USERPROFILE\.grok\skills\chart-in-chat\scripts\render_chart.py" --demo --ascii
# Agent then: read_file on the printed PNG path → image appears in chat
```

Slash: `/chart-in-chat` · Skill name: `chart-in-chat`

## Next iterations

- [ ] Polars/DuckDB power mode (aggregate → then emit spec)
- [ ] Vega-Embed viewer sibling
- [ ] Kitty/WezTerm image protocol export
- [ ] Wire into SHKG / MemSync as `viz` skill
- [ ] Bun port of the builder for zero-Python hosts
