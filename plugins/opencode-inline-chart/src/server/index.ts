/**
 * OpenCode SERVER plugin — create_inline_chart
 *
 * Puts a PNG into the chat via ToolResult.attachments (image/png).
 * Also embeds a markdown data-URL image in output as a second path.
 * Does NOT open a browser. Does NOT merely cite an on-disk path.
 */
import type { Plugin, PluginModule } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { buildChart, formatToolOutput } from "../chart/build.ts"
import { buildVegaLiteSpec, renderChartToFiles } from "../chart/vega_render.ts"
import {
  CHART_PLUGIN_ID,
  CHART_TOOL_NAME,
  type ChartRequest,
  type ChartType,
} from "../chart/types.ts"

const chartTypes = [
  "line",
  "bar",
  "scatter",
  "pie",
  "area",
  "heatmap",
  "candlestick",
  "boxplot",
] as const

function toDataUrl(pngPath: string): string {
  const buf = readFileSync(pngPath)
  return `data:image/png;base64,${buf.toString("base64")}`
}

const server: Plugin = async ({ client, directory }) => {
  await client.app.log({
    body: {
      service: CHART_PLUGIN_ID,
      level: "info",
      message: "inline-chart: attachments + markdown data-url",
      extra: { directory },
    },
  })

  return {
    tool: {
      [CHART_TOOL_NAME]: tool({
        description:
          "REQUIRED for any plot/chart/graph. Renders a chart and attaches image/png INLINE in the OpenCode chat. Always call this tool — never only reference an existing .png path. Reads optional data from data/quarterly_revenue.json when user asks for quarterly revenue demo.",
        args: {
          chart_type: tool.schema.enum(chartTypes).describe("Chart type"),
          title: tool.schema.string().optional().describe("Chart title"),
          data: tool.schema
            .array(tool.schema.record(tool.schema.string(), tool.schema.any()))
            .describe("Data points as objects"),
          x_field: tool.schema.string().optional(),
          y_field: tool.schema.string().optional(),
          series_field: tool.schema.string().optional(),
          options: tool.schema
            .object({
              show_trendline: tool.schema.boolean().optional(),
              show_legend: tool.schema.boolean().optional(),
              interactive: tool.schema.boolean().optional(),
              theme: tool.schema.enum(["dark", "light"]).optional(),
              annotations: tool.schema.array(tool.schema.any()).optional(),
              height: tool.schema.number().optional(),
              moving_average: tool.schema.number().optional(),
              renderer: tool.schema.enum(["echarts", "vega-lite"]).optional(),
            })
            .optional(),
        },
        async execute(args, context) {
          const req: ChartRequest = {
            chart_type: args.chart_type as ChartType,
            title: args.title,
            data: (args.data ?? []) as Array<Record<string, unknown>>,
            x_field: args.x_field,
            y_field: args.y_field,
            series_field: args.series_field,
            options: args.options as ChartRequest["options"],
          }

          if (!req.data.length) {
            return {
              title: "Chart error",
              output: "ERROR: data array is empty. Pass data points or use data/quarterly_revenue.json.",
              attachments: [],
            }
          }

          const envelope = buildChart(req)
          envelope.vegaLiteSpec = buildVegaLiteSpec(req)

          const stamp = new Date().toISOString().replace(/[:.]/g, "-")
          const base = `chart_${stamp}`
          const outCandidates = [
            resolve(context.directory, ".opencode", "charts"),
            resolve(homedir(), ".cache", "opencode", "charts"),
          ]

          let pngPath: string | undefined
          let lastErr: unknown
          for (const outDir of outCandidates) {
            try {
              const files = await renderChartToFiles(req, envelope, outDir, base)
              pngPath = files.pngPath
              envelope.meta.png = files.pngPath
              envelope.meta.svg = files.svgPath
              envelope.meta.html = files.htmlPath
              envelope.vegaLiteSpec = files.vegaLiteSpec
              break
            } catch (e) {
              lastErr = e
            }
          }

          if (!pngPath) {
            return {
              title: "Chart error",
              output: `Failed to rasterize chart: ${String(lastErr)}\n\n${envelope.ascii}`,
              attachments: [],
            }
          }

          const dataUrl = toDataUrl(pngPath)
          const fileUrl = pathToFileURL(pngPath).href

          // Dual attachment strategy: data URL (self-contained) + file URL
          const attachments = [
            {
              type: "file" as const,
              mime: "image/png",
              url: dataUrl,
              filename: basename(pngPath),
            },
            {
              type: "file" as const,
              mime: "image/png",
              url: fileUrl,
              filename: basename(pngPath),
            },
          ]

          context.metadata({
            title: envelope.meta.title || "Chart",
            metadata: {
              oc_plugins_chart: true,
              envelope: {
                type: envelope.type,
                renderer: envelope.renderer,
                interactive: false, // honest: raster is not interactive in TUI
                meta: envelope.meta,
                spec: envelope.spec,
                vegaLiteSpec: envelope.vegaLiteSpec,
                ascii: envelope.ascii,
              },
              media: { png: pngPath },
            },
          })

          await client.app.log({
            body: {
              service: CHART_PLUGIN_ID,
              level: "info",
              message: "chart attached for inline chat",
              extra: {
                png: pngPath,
                bytes: readFileSync(pngPath).length,
                sessionID: context.sessionID,
              },
            },
          })

          return {
            title: envelope.meta.title || "Chart",
            output: formatToolOutput(envelope, { pngDataUrl: dataUrl }),
            metadata: {
              oc_plugins_chart: true,
              png: pngPath,
              mime: "image/png",
            },
            attachments,
          }
        },
      }),
    },
  }
}

export default {
  id: CHART_PLUGIN_ID,
  server,
} satisfies PluginModule & { id: string }

export const InlineChartPlugin = server
