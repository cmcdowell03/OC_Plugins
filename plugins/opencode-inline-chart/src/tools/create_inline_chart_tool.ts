import { tool } from "@opencode-ai/plugin"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { buildChart, formatToolOutput } from "../chart/build.ts"
import { buildVegaLiteSpec, renderChartToFiles } from "../chart/vega_render.ts"
import type { ChartRequest, ChartType } from "../chart/types.ts"

const chartTypes = ["line","bar","scatter","pie","area","heatmap","candlestick","boxplot"] as const

export default tool({
  description: "REQUIRED for any plot. Attaches image/png INLINE in chat. Never only cite an existing .png path.",
  args: {
    chart_type: tool.schema.enum(chartTypes),
    title: tool.schema.string().optional(),
    data: tool.schema.array(tool.schema.record(tool.schema.string(), tool.schema.any())),
    x_field: tool.schema.string().optional(),
    y_field: tool.schema.string().optional(),
    series_field: tool.schema.string().optional(),
    options: tool.schema.object({
      theme: tool.schema.enum(["dark","light"]).optional(),
      annotations: tool.schema.array(tool.schema.any()).optional(),
      height: tool.schema.number().optional(),
      moving_average: tool.schema.number().optional(),
      show_legend: tool.schema.boolean().optional(),
    }).optional(),
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
      return { title: "Chart error", output: "data array empty", attachments: [] }
    }
    const envelope = buildChart(req)
    envelope.vegaLiteSpec = buildVegaLiteSpec(req)
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const base = "chart_" + stamp
    let pngPath: string | undefined
    for (const outDir of [
      resolve(context.directory, ".opencode", "charts"),
      resolve(homedir(), ".cache", "opencode", "charts"),
    ]) {
      try {
        const files = await renderChartToFiles(req, envelope, outDir, base)
        pngPath = files.pngPath
        envelope.meta.png = files.pngPath
        envelope.meta.svg = files.svgPath
        envelope.meta.html = files.htmlPath
        break
      } catch {}
    }
    if (!pngPath) {
      return { title: "Chart error", output: envelope.ascii, attachments: [] }
    }
    const dataUrl = "data:image/png;base64," + readFileSync(pngPath).toString("base64")
    context.metadata({
      title: envelope.meta.title || "Chart",
      metadata: { oc_plugins_chart: true, envelope, media: { png: pngPath } },
    })
    return {
      title: envelope.meta.title || "Chart",
      output: formatToolOutput(envelope, { pngDataUrl: dataUrl }),
      metadata: { oc_plugins_chart: true, png: pngPath },
      attachments: [
        { type: "file", mime: "image/png", url: dataUrl, filename: basename(pngPath) },
        { type: "file", mime: "image/png", url: pathToFileURL(pngPath).href, filename: basename(pngPath) },
      ],
    }
  },
})
