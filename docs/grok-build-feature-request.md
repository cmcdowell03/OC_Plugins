# Feature request draft — paste to Grok Build / xAI feedback

**Title:** First-class interactive charts in Grok Build TUI scrollback

## Summary

Add a native message part for charts so the agent can render data visualizations **inline in the TUI**, with a path to real interactivity (zoom/pan/tooltips), not only static PNGs via `read_file`.

## Why

Data-heavy workflows (metrics, trading, bio signals, CI trends, agent eval curves) need charts in-thread. Current plugins/skills cannot register custom TUI renderers. The best workaround is generate PNG → `read_file`, which is static and awkward.

## Proposal (short)

1. Accept structured envelope:

```json
{
  "type": "chart",
  "renderer": "echarts",
  "spec": {},
  "interactive": true,
  "meta": { "data_points": 42 }
}
```

2. Scrollback: show high-quality preview (image protocol or PNG).
3. `Enter` on the block: open interactive viewer (WebView + ECharts/Vega), matching existing fullscreen tool viewer UX.
4. Built-in tool `create_inline_chart` (declarative specs only — no arbitrary code).
5. Optional later: click → inject follow-up user message for drill-down.

## References (local design)

- Full RFC: `OC_Plugins/docs/grok-build-inline-charts-rfc.md`
- Working envelope + tool: `OC_Plugins/plugins/inline-chart/`
- Static chat skill: `~/.grok/skills/chart-in-chat`

## Environment

- Grok Build 0.2.x (`grok.exe`)
- Windows Terminal / (target: Kitty, WezTerm, Ghostty image protocols)
