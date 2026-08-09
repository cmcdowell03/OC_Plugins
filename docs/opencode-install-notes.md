# OpenCode install notes (this machine)

Captured 2026-07-20 while scaffolding `opencode-inline-chart`.

## Runtime

| Item | Value |
|------|--------|
| CLI | `opencode` → npm `opencode-ai@1.18.3` |
| Binary | `…\npm\node_modules\opencode-ai\node_modules\opencode-windows-x64\bin\opencode.exe` |
| Bun | 1.3.14 (`bun.ps1` on PATH) |
| Node | present (npm) |
| Desktop | `ai.opencode.desktop` (WebView2) under LocalAppData |

## Paths

| Path | Role |
|------|------|
| `~/.config/opencode` | Config (`opencode.jsonc`, `tui.json`, `package.json`, plugins, tools) |
| `~/.cache/opencode` | Bun cache, models, packages |
| `~/.local/share/opencode` | Data, logs, repos |
| `~/.local/state/opencode` | State |

`opencode debug paths` is authoritative.

## Plugin APIs (installed `@opencode-ai/plugin@1.4.3`)

| Import | Purpose |
|--------|---------|
| `@opencode-ai/plugin` | Server: hooks, `tool()`, auth, chat hooks |
| `@opencode-ai/plugin/tool` | Tool helper |
| `@opencode-ai/plugin/tui` | TUI: routes, commands, slots, events, theme, kv |

**Server** plugins may live in:

- `~/.config/opencode/plugins/*.{ts,js}`
- project `.opencode/plugins/`
- `opencode.json(c)` → `"plugin": ["npm-name" | "file:///..."]`

**Custom tools** also:

- `~/.config/opencode/tools/*.ts` (filename = tool name)
- project `.opencode/tools/`

**TUI** plugins: separate module exporting `{ id, tui }`; peers `@opentui/solid` / `@opentui/core` supplied by host. Configure via `tui.json` `plugin` array (and/or package `exports["./tui"]` when packaging for npm).

## Tool result shape

- `execute` → **`Promise<string>`** only
- `context.metadata({ title, metadata })` for structured side-channel
- Completed tool part may include `state.metadata` and optional `attachments: FilePart[]` (mime + url) — used by host when supported

## Chart plugin

See `plugins/opencode-inline-chart/`.
