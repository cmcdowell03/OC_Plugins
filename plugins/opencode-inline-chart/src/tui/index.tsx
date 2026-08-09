/**
 * OpenCode TUI plugin — keep charts IN the session, no browser pop-out.
 *
 * Primary path: tool image attachments render inline in chat (host support).
 * Secondary: /chart route shows ASCII + PNG path for terminals without image protocol.
 *
 * @jsxImportSource @opentui/solid
 */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import {
  CHART_KV_HISTORY,
  CHART_KV_LAST,
  CHART_PLUGIN_ID,
  CHART_ROUTE,
  CHART_TOOL_NAME,
  type ChartEnvelope,
} from "../chart/types.ts"

type HistoryItem = {
  at: string
  sessionID?: string
  envelope: ChartEnvelope
}

function extractAscii(output: string): string {
  const lines = output.split(/\r?\n/)
  const start = lines.findIndex((l) => l.startsWith("╭") || l.startsWith("┌"))
  if (start < 0) return ""
  const chunk: string[] = []
  for (let i = start; i < lines.length; i++) {
    chunk.push(lines[i]!)
    if (lines[i]!.startsWith("╰") || lines[i]!.startsWith("└")) break
  }
  return chunk.join("\n")
}

function parseChartFromToolOutput(output: string): ChartEnvelope | null {
  const fence = output.match(/```chart\s*([\s\S]*?)```/)
  if (!fence?.[1]) return null
  try {
    const obj = JSON.parse(fence[1])
    if (obj?.type !== "chart") return null
    return {
      type: "chart",
      renderer: obj.renderer ?? "echarts",
      spec: obj.spec ?? {},
      vegaLiteSpec: obj.vegaLiteSpec,
      interactive: obj.interactive !== false,
      meta: obj.meta ?? {
        data_points: 0,
        chart_type: "line",
        generated_at: new Date().toISOString(),
      },
      ascii: extractAscii(output) || "(chart)",
    }
  } catch {
    return null
  }
}

const tui: TuiPlugin = async (api) => {
  const storeLast = (envelope: ChartEnvelope, sessionID?: string) => {
    api.kv.set(CHART_KV_LAST, envelope)
    const hist = (api.kv.get<HistoryItem[]>(CHART_KV_HISTORY, []) ?? []) as HistoryItem[]
    hist.push({ at: new Date().toISOString(), sessionID, envelope })
    api.kv.set(CHART_KV_HISTORY, hist.slice(-20))
  }

  api.route.register([
    {
      name: CHART_ROUTE,
      render: ({ params }) => {
        const env =
          (params?.envelope as ChartEnvelope | undefined) ??
          api.kv.get<ChartEnvelope>(CHART_KV_LAST)
        const title = env?.meta?.title || "Chart"
        const ascii = env?.ascii || "No chart in this session yet."
        const png = env?.meta?.png
        const theme = api.theme.current
        const meta = env
          ? `${env.meta.chart_type} · ${env.meta.data_points} pts · attached as image/png in chat`
          : ""

        return (
          <box
            flexDirection="column"
            padding={1}
            gap={1}
            backgroundColor={theme.background}
            width="100%"
            height="100%"
          >
            <box flexDirection="row" justifyContent="space-between">
              <text fg={theme.primary}>{title}</text>
              <text fg={theme.textMuted}>{meta}</text>
            </box>

            <box
              flexDirection="column"
              borderStyle="single"
              borderColor={theme.borderActive}
              padding={1}
              backgroundColor={theme.backgroundPanel}
              gap={1}
            >
              <text fg={theme.success}>
                Inline goal: chart ships as tool attachment (image/png) in the chat stream.
              </text>
              <text fg={theme.textMuted}>
                If your OpenCode build paints tool image attachments, the chart appears in-scrollback
                above this panel. Full DOM interactivity (ECharts hover) needs a WebView message part
                from OpenCode core — not available via plugins alone.
              </text>
              {png ? <text fg={theme.markdownLink}>PNG on disk: {png}</text> : null}
            </box>

            <box
              flexDirection="column"
              borderStyle="single"
              borderColor={theme.border}
              padding={1}
              backgroundColor={theme.backgroundElement}
            >
              <text fg={theme.markdownCode}>{ascii}</text>
            </box>
          </box>
        )
      },
    },
  ])

  api.command.register(() => [
    {
      title: "Show last chart (in TUI)",
      value: "oc-plugins.chart.open",
      description: "Session chart panel — no browser",
      category: "Charts",
      suggested: true,
      slash: { name: "chart", aliases: ["charts", "plot"] },
      onSelect: () => {
        const env = api.kv.get<ChartEnvelope>(CHART_KV_LAST)
        if (!env) {
          api.ui.toast({
            variant: "warning",
            message: "No chart yet — ask the agent to call create_inline_chart",
          })
          return
        }
        api.route.navigate(CHART_ROUTE, { envelope: env })
      },
    },
  ])

  // Capture charts into KV when the tool completes (do NOT open a browser)
  const off = api.event.on("message.part.updated", (event) => {
    const part = event.properties.part
    if (!part || part.type !== "tool") return
    if (part.tool !== CHART_TOOL_NAME) return
    if (part.state.status !== "completed") return

    const sessionID = event.properties.sessionID
    const output = part.state.output || ""
    const metaRoot = (part.state.metadata ?? part.metadata) as
      | { envelope?: ChartEnvelope; media?: { png?: string } }
      | undefined

    let envelope: ChartEnvelope | null = null
    if (metaRoot?.envelope?.type === "chart") {
      envelope = metaRoot.envelope
    } else {
      envelope = parseChartFromToolOutput(output)
    }
    if (!envelope) return

    if (metaRoot?.media?.png) {
      envelope.meta.png = envelope.meta.png || metaRoot.media.png
    }

    storeLast(envelope, sessionID)

    api.ui.toast({
      variant: "success",
      title: envelope.meta.title || "Chart",
      message: envelope.meta.png
        ? "Inline PNG attached to chat · /chart for panel"
        : "Chart ready · /chart",
      duration: 3500,
    })
  })

  api.lifecycle.onDispose(() => {
    off()
  })
}

export default {
  id: `${CHART_PLUGIN_ID}-tui`,
  tui,
} satisfies TuiPluginModule & { id: string }
