# Inline interactive charts in OpenCode TUI — reality check

## Your goal

> Interactive Vega/ECharts chart rendered **inline in the TUI chat**, not a browser pop-out.

## What is physically possible

| Surface | Can show rich chart? | Interactive (hover/zoom)? | Who owns it |
|---------|----------------------|---------------------------|-------------|
| **Tool `attachments` image/png** | Yes — image in message stream | **No** (static raster) | OpenCode host (if it paints tool images) |
| **Markdown `![](file)` in tool output** | Sometimes | No | Host markdown renderer |
| **TUI plugin route (`/chart`)** | ASCII / path panel | No | Our plugin |
| **Kitty/Sixel image protocol** | Yes, if OpenTUI implements it | No | OpenTUI core ([issue #92](https://github.com/anomalyco/opentui/issues/92)) |
| **ECharts/Vega DOM widget in scrollback** | Requires WebView/iframe message part | **Yes** | **OpenCode core** — no plugin API today |
| **Browser HTML file** | Yes | Yes | Pop-out (you rejected this) |

## Plugin API we use (correct path for “in chat”)

`@opencode-ai/plugin` **1.18+** allows:

```ts
return {
  title: "Chart",
  output: "...",
  attachments: [
    { type: "file", mime: "image/png", url: "file:///...", filename: "chart.png" }
  ]
}
```

That is the **only** supported way for a plugin tool to put a **visual chart into the chat transcript**.

Our `create_inline_chart` tool:

1. Builds ECharts + Vega-Lite specs
2. Rasterizes Vega-Lite → **PNG** (headless)
3. Returns that PNG as a **tool attachment** (inline image)
4. Does **not** auto-open a browser

## What “interactive” would require from OpenCode

A first-class message/tool part such as:

```ts
{ type: "chart", renderer: "echarts" | "vega-lite", spec: {...} }
```

rendered by the host as:

- **Desktop/Web**: embedded WebView (full ECharts)
- **Terminal**: progressive enhancement (PNG via Kitty graphics → ASCII fallback)

Until that exists, **plugins cannot inject an interactive JS chart engine into the TUI chat bubble.**

## Feature request (one paragraph for OpenCode)

> Please add a structured tool/message part for declarative charts (`type: "chart"` with ECharts or Vega-Lite JSON), rendered inline: WebView/HTML island on Desktop/Web, Kitty/Sixel or PNG on terminal. Plugin tools already produce the envelope; we need the host renderer. See also image attachments for tool results and OpenTUI graphics protocol support.

## What we ship now

| Deliverable | Status |
|-------------|--------|
| Vega-Lite PNG attached to tool result | ✅ |
| No browser pop-out by default | ✅ |
| ECharts + VL specs in ` ```chart ` fence | ✅ |
| `/chart` TUI panel (no external window) | ✅ |
| True hover/zoom ECharts inside terminal chat | ❌ needs OpenCode core |

## Verify on your build

1. Upgrade / use OpenCode **≥ 1.18** with plugin **1.18.3**.
2. Restart `opencode`.
3. Ask for a plot with `create_inline_chart`.
4. Confirm the tool card shows an **image** under the result (not only ASCII).

If the image is missing, your TUI build may not paint tool image attachments yet — that is still a **host** gap (upstream issues track inline tool images / Sixel).
