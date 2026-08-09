# opencode-inline-chart

Inline charts for **OpenCode 1.18+** (Bun/TS).

| Layer | Entry | Role |
|-------|--------|------|
| **Server** | `src/server/index.ts` | Tool `create_inline_chart` — builds ECharts envelope + ASCII |
| **TUI** | `src/tui/index.tsx` | `/chart` route, toast on tool complete, last-chart KV |
| **Web** | `viewer/echarts_viewer.html` | Full interactive ECharts (desktop/browser) |

Pure **Bun/TypeScript** chart builder. **Primary UX: chart appears INLINE in the OpenCode chat** via tool **image attachments** (`image/png`), not a browser window.

### How inline chat rendering works

```ts
// ToolResult (plugin 1.18+)
return {
  title: "Chart",
  output: "…ascii…",
  attachments: [
    { type: "file", mime: "image/png", url: "file:///…/chart.png", filename: "chart.png" }
  ]
}
```

OpenCode paints tool image attachments **in the message stream** when the host supports it (Desktop/Web always better; terminal depends on image/Sixel/Kitty support in OpenTUI).

| Artifact | Role |
|----------|------|
| **PNG attachment** | **In-chat** rich chart (primary goal) |
| Vega-Lite + ECharts specs | Stored in envelope for future host WebView parts |
| ASCII | Fallback in tool text |
| `/chart` | In-TUI panel only (no browser) |

**Not possible from a plugin alone:** live ECharts hover/zoom *inside* the terminal cell grid. That needs an OpenCode **core** `type: "chart"` WebView part. See `docs/opencode-inline-chart-reality.md`.

## Tested versions

```
opencode 1.18.3  (npm: opencode-ai)
bun 1.3.14
@opencode-ai/plugin 1.18.3  (server + ./tui exports)
config:  ~/.config/opencode/
```

OpenCode plugin model:

- **Server plugins**: hooks + `tool:{}` via `@opencode-ai/plugin`
- **TUI plugins**: routes, commands, slots, events via `@opencode-ai/plugin/tui` (OpenTUI Solid)
- Tool `execute` returns a structured result with text and attachments; use `context.metadata()` for host metadata
- TUI watches `message.part.updated` for completed `create_inline_chart`

## Install

```powershell
Set-Location .\plugins\opencode-inline-chart # from the repository root
.\scripts\install.ps1
```

Then **restart OpenCode**. Check:

```powershell
opencode debug config
```

You should see a `plugin` entry pointing at this package’s server module.

## Smoke test (no TUI)

```powershell
bun run .\scripts\smoke-test.ts
```

## Usage in OpenCode

Prompt:

> Plot quarterly revenue with a 3-month moving average and highlight Q3-24.

Agent should call **`create_inline_chart`**. Transcript shows ASCII + ` ```chart ` JSON.

In TUI:

- `/chart` — full-screen ASCII chart viewer (last chart)
- Command palette → “Open last chart”

Interactive ECharts: open `viewer/echarts_viewer.html` and inject envelope via `window.CHART_ENVELOPE` (or postMessage). Desktop OpenCode may render tool output markdown; image attachments are a future enhancement.

## Architecture notes

```
LLM ──► create_inline_chart (server tool)
           │
           ├─ metadata.envelope  (for TUI)
           └─ string output: ASCII + ```chart JSON
                    │
TUI event message.part.updated
           │
           ├─ kv last chart
           ├─ toast
           └─ /chart route → OpenTUI ASCII panel
```

True **pixel-interactive** charts inside the terminal still depend on OpenTUI capabilities; this plugin delivers the best supported path today: **inline ASCII in tool result + dedicated chart route + web viewer for ECharts**.

## Files

```
opencode-inline-chart/
├── package.json
├── src/
│   ├── chart/types.ts
│   ├── chart/build.ts      # Bun chart builder
│   ├── server/index.ts     # PluginModule server
│   └── tui/index.tsx       # TuiPluginModule
├── viewer/echarts_viewer.html
└── scripts/
    ├── install.ps1
    └── smoke-test.ts
```
