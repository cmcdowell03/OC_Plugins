# Inline Chart Plugin — Design

A charting tool plug-in that renders **natively inline in chat** turns the conversation into a live data exploration environment. Follow-ups like “add the moving average” or “highlight the Q3 anomaly” update the chart in-thread.

Full implementation: `plugins/inline-chart/`.

## Core architecture

### 1. Tool layer (what the LLM calls)

Tool name: **`create_inline_chart`**

Schema: `plugins/inline-chart/schemas/create_inline_chart.json`

```json
{
  "name": "create_inline_chart",
  "parameters": {
    "type": "object",
    "properties": {
      "chart_type": {
        "type": "string",
        "enum": ["line", "bar", "scatter", "pie", "area", "heatmap", "candlestick", "boxplot"]
      },
      "title": { "type": "string" },
      "data": {
        "type": "array",
        "items": { "type": "object" },
        "description": "Data points. Can be flat objects or use x_field/y_field for flexibility."
      },
      "x_field": { "type": "string" },
      "y_field": { "type": "string" },
      "series_field": {
        "type": "string",
        "description": "Column for multi-series grouping"
      },
      "options": {
        "type": "object",
        "properties": {
          "show_trendline": { "type": "boolean" },
          "show_legend": { "type": "boolean", "default": true },
          "interactive": { "type": "boolean", "default": true },
          "theme": { "type": "string", "enum": ["dark", "light"] },
          "annotations": { "type": "array" },
          "height": { "type": "number", "default": 420 }
        }
      }
    },
    "required": ["chart_type", "data"]
  }
}
```

**Implementation options**

| Mode | Behavior |
|------|----------|
| **Preferred (declarative)** | Normalize input → Vega-Lite or ECharts JSON. No arbitrary code. |
| **Power mode** | Sandboxed Polars/DuckDB for stats/regressions, then emit the same envelope. |

**Envelope the renderer recognizes**

```json
{
  "type": "chart",
  "renderer": "echarts",
  "spec": {},
  "interactive": true,
  "meta": { "data_points": 42, "generated_at": "..." }
}
```

### 2. Rendering layer

| Host | Renderer |
|------|----------|
| Web / IDE / Desktop | ECharts or Vega-Embed island; toolbox export; click → follow-up tools |
| OpenCode TUI | ASCII/Unicode (`plotext` / sparkline) or SVG image protocol (Kitty/WezTerm/Ghostty) or tiny webview |

### 3. Plugin / extension points

- **OpenCode:** custom tool (`opencode/create_inline_chart.ts`), agent prompt, MCP hook
- **Harness:** first-class `viz` skill; datasets via files / MemSync / SHKG
- **Cursor:** output parser + webview / inline markdown
- **General chat UIs:** same structured output + renderer registry (like Mermaid)

## End-to-end flow

1. User: “Plot quarterly revenue with 3-month MA; highlight Q3 spike.”
2. Agent → `create_inline_chart` (data + options).
3. Tool → `type: "chart"` envelope.
4. UI mounts interactive chart in the AI bubble.
5. Follow-ups mutate/replace the chart via new tool calls.

## Looping tips (related)

See `docs/tips-and-gotchas.md` — session IDs, `serve`+`--attach`, `--format json`, permissions, local models, TUI debug.

## Quick start

```powershell
cd plugins\inline-chart
python .\src\chart_tool.py --demo --ascii
.\examples\render_demo.ps1
```
