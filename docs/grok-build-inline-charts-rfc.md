# RFC: Interactive inline charts in Grok Build TUI

**Status:** Proposal (external)<br>
**Audience:** Grok Build / xai-grok-pager maintainers; local power users<br>
**Related:** `plugins/inline-chart`, skill `chart-in-chat`, envelope `type: "chart"`

---

## Problem

Users want charts to appear **inside the Grok Build TUI conversation**, not as:

- “here’s matplotlib code, go run it”
- external browser tabs
- static images only (current best workaround)

Desired UX:

1. Agent (or tool) emits a structured chart payload.
2. The **pager/TUI** mounts a chart block in the scrollback (same place as markdown, diffs, tool cards).
3. User can pan/zoom/hover **or** at least see a high-quality inline figure without leaving the session.
4. Follow-ups (“add MA”, “highlight Q3”) update the same thread with a new chart block.

---

## Current reality (Grok Build 0.2.x)

| Layer | What exists today | Gap |
|-------|-------------------|-----|
| **Binary** | Closed `grok.exe` (TUI + agent) | No public widget plugin API |
| **Plugins** | Skills, hooks, MCP, agents, slash commands | **No custom message renderers** |
| **Message UI** | Markdown, syntax highlight, tool cards, diffs, image *inputs* (prompt chips), citations | No first-class `type: chart` part |
| **Agent render components** | e.g. inline citation | Chart component not exposed |
| **Workaround** | `chart-in-chat` skill → PNG → `read_file` shows image | Static; not interactive; not a native TUI block |

**Conclusion:** Interactive (or even first-class static) inline charts require **Grok Build core changes** (pager + protocol). Skills/MCP alone cannot inject widgets into the scrollback.

---

## Goals / non-goals

### Goals

1. First-class **message part**: `chart` (structured envelope).
2. At least one **in-TUI** presentation path that feels native.
3. Safe: declarative specs only (ECharts / Vega-Lite JSON) — no arbitrary code in the renderer.
4. Degrade gracefully on weak terminals.

### Non-goals (v1)

- Full browser-grade BI dashboards inside every terminal.
- Mutating agent memory solely by clicking chart points (nice follow-on).
- Replacing OpenCode / web UIs.

---

## Proposed architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Agent / tool                                                  │
│   create_inline_chart → envelope:                             │
│   { "type":"chart", "renderer":"echarts"|"vega-lite",         │
│     "spec":{...}, "interactive":true, "meta":{...} }          │
└────────────────────────────┬─────────────────────────────────┘
                             │ message part / tool result
┌────────────────────────────▼─────────────────────────────────┐
│ Grok Build pager (xai-grok-pager)                             │
│   MessagePart::Chart { envelope, png_cache?, interactivity }  │
│                                                               │
│   Render pipeline (capability ladder):                        │
│     L3 Interactive  → embedded webview / GPU widget (opt-in)  │
│     L2 Rich image   → Kitty/iTerm/WezTerm image protocol      │
│     L1 Raster       → pre-rendered PNG in scrollback          │
│     L0 ASCII        → braille/sparkline block                 │
└──────────────────────────────────────────────────────────────┘
```

Reuse the envelope already defined in `plugins/inline-chart` so OpenCode, harnesses, and Grok share one schema.

---

## Capability ladder (implementation phases)

### Phase 0 — Protocol only (smallest core PR)

1. Recognize tool results / fenced blocks:

   ````markdown
   ```chart
   { "type":"chart", "renderer":"echarts", "spec":{...}, ... }
   ```
   ````

   or a dedicated content block in the agent stream (preferred over markdown fence long-term).

2. Persist the envelope on the session message part (like tool results).

3. Render **L1**: server-side or local rasterize → show PNG in scrollback (same path images already use when `read_file` loads a PNG).

**User value:** Charts appear as real TUI blocks without the agent calling `read_file` manually.<br>
**Still not interactive**, but first-class.

### Phase 1 — Terminal image protocol (L2)

For Kitty, Ghostty, WezTerm, iTerm2 (already partially in Grok’s terminal matrix):

- Prefer **Kitty graphics protocol** / iTerm inline images over dumping raw base64 as text.
- Cache rendered bitmaps; reflow on resize.
- Optional: re-render on theme change.

**User value:** Crisp inline figures, zoom via terminal where supported; no temp files in the narrative.

### Phase 2 — Interactivity (L3) — true “interactive inline”

Terminals are not DOM. Pick one primary approach:

| Option | Pros | Cons |
|--------|------|------|
| **A. Side webview panel** | Real ECharts; click/zoom; familiar | Not “in scrollback”; needs desktop/webview host |
| **B. Click-to-expand overlay** | Chart stays referenced in thread; full UI on `Enter` | Extra keystroke; overlay complexity |
| **C. Minimal in-TUI controls** | Pure TUI (keys: `z` zoom, arrows pan) on a raster | Limited; heavy to implement well |
| **D. Hybrid** | L1/L2 in scrollback + `Enter` opens interactive overlay/webview | Best practical UX |

**Recommendation:** **D (Hybrid)** for Grok Build.

- Scrollback always shows a frozen preview (PNG / image protocol).
- Focus chart block + `Enter` (same as fullscreen viewer for tool cards) opens **Chart viewer**:
  - Embedded WebView loading `echarts_viewer.html` + `postMessage(envelope)`
  - or system browser to `localhost` ephemeral server
- `c` copies envelope JSON; `e` exports PNG/SVG; `u` “update with instruction” inserts a follow-up prompt template.

This matches existing TUI patterns (`Enter` → fullscreen viewer) and delivers real interactivity without forcing a browser into every scroll line.

### Phase 3 — Bidirectional (drill-down)

Chart click → `chart_click` event → optional user confirmation → inject as user message:

```text
[chart interaction] series=revenue x=Q3-24 value=9.2
Explain this spike and replot with annotation.
```

Wire to the same multi-agent loop patterns in `docs/advanced-agentic-loops.md`.

---

## Agent / tool contract

### Tool: `create_inline_chart` (or built-in)

Same schema as `plugins/inline-chart/schemas/create_inline_chart.json`.

### Streamed assistant content (preferred long-term)

Add a first-class render component (alongside citations), e.g.:

```xml
render_chart
chart_json is the envelope or a file:// / session artifact id
```

Pager resolves artifact → `MessagePart::Chart`.

### Safety

- Allowlist renderers: `echarts`, `vega-lite` only.
- Spec size caps (e.g. 2 MB JSON, 50k points → downsample with warning).
- No `eval`, no remote script URLs in specs (CDN only for known viewer build shipped with Grok).
- Permissions: chart tool is read-only over data; no filesystem write except cache under `~/.grok/cache/charts/`.

---

## What we can do *without* core changes (today)

| Approach | Interactive? | Inline in TUI? |
|----------|--------------|----------------|
| Skill `chart-in-chat` + `read_file` PNG | No | Image yes |
| Open HTML viewer (`render_demo.ps1`) | Yes | No (external) |
| MCP tool returning image base64 | No* | Only if pager renders images from tool results |
| Plugin skill/hook | No | No custom widgets |

\*Unless Phase 0 lands.

These remain useful for OpenCode and harnesses; they are **not** a substitute for modifying Grok Build.

---

## Suggested core PR sequence (for Grok Build maintainers)

1. **`MessagePart::Chart` + JSON envelope validation**
2. **Raster pipeline** (reuse matplotlib or a Rust plot crate / headless Vega) → PNG in scrollback
3. **Fullscreen chart viewer** on `Enter` (WebView or local HTML)
4. **Kitty/iTerm image protocol** path for preview
5. **Built-in tool** `create_inline_chart` so the model doesn’t depend on a user skill
6. **Click → follow-up** events

---

## Local experiment plan (this machine)

Until core ships, keep:

1. **`~/.grok/skills/chart-in-chat`** — best-in-class static inline via PNG + `read_file`.
2. **`OC_Plugins/plugins/inline-chart`** — shared envelope + ECharts viewer for external interactive.
3. Optional: slash command `/chart` that only documents “use chart-in-chat skill”.

Do **not** claim plugins can inject interactive TUI widgets — they cannot on 0.2.x.

---

## Open questions for maintainers

1. Is the pager open to new `MessagePart` variants in the near term?
2. Is WebView acceptable on Windows/macOS/Linux for fullscreen viewers (Tauri/Wry dependency)?
3. Should chart envelopes live in session SQLite as artifacts (like images)?
4. Prefer fenced ` ```chart ` vs structured stream events vs tool-result-only?

---

## Bottom line

- **Yes**, interactive-or-native inline charts are the right product direction.
- **No**, skills/plugins alone cannot modify Grok Build’s TUI widget tree today.
- **Path:** core pager protocol (`type: "chart"`) + hybrid preview/overlay; reuse the declarative envelope already built in OC_Plugins.
- **Until then:** PNG-in-chat skill is the honest TUI integration; HTML viewer is the honest interactive path.
