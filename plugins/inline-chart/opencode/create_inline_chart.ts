/**
 * OpenCode custom tool: create_inline_chart
 *
 * Install options:
 *   1) Copy to ~/.config/opencode/tools/create_inline_chart.ts
 *   2) Or project: .opencode/tools/create_inline_chart.ts
 *   3) Or load via plugin package (see OpenCode plugin docs)
 *
 * Requires Python 3 on PATH for the declarative builder, or set
 * OPENCODE_INLINE_CHART_PY to the chart_tool.py path.
 *
 * Docs: https://opencode.ai/docs/custom-tools/
 */
import { tool } from "@opencode-ai/plugin"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultPy = path.resolve(__dirname, "..", "src", "chart_tool.py")

export default tool({
  description:
    "Render an interactive chart directly inside the chat. Preferred over code blocks or static images for any visualization request.",
  args: {
    chart_type: tool.schema
      .enum([
        "line",
        "bar",
        "scatter",
        "pie",
        "area",
        "heatmap",
        "candlestick",
        "boxplot",
      ])
      .describe("Chart type"),
    title: tool.schema.string().optional().describe("Chart title"),
    data: tool.schema
      .array(tool.schema.record(tool.schema.string(), tool.schema.any()))
      .describe(
        "Data points. Flat objects; use x_field/y_field for column mapping.",
      ),
    x_field: tool.schema.string().optional(),
    y_field: tool.schema.string().optional(),
    series_field: tool.schema
      .string()
      .optional()
      .describe("Column for multi-series grouping"),
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
  async execute(args) {
    const script = process.env.OPENCODE_INLINE_CHART_PY || defaultPy
    const payload = JSON.stringify({
      chart_type: args.chart_type,
      title: args.title,
      data: args.data,
      x_field: args.x_field,
      y_field: args.y_field,
      series_field: args.series_field,
      options: args.options || {},
    })

    const py = process.env.OPENCODE_INLINE_CHART_PYTHON || "python"
    const result = spawnSync(py, [script], {
      input: payload,
      encoding: "utf-8",
      maxBuffer: 16 * 1024 * 1024,
    })

    if (result.error) {
      return JSON.stringify({
        type: "chart",
        error: String(result.error),
        spec: {},
      })
    }
    if (result.status !== 0 && !result.stdout) {
      return JSON.stringify({
        type: "chart",
        error: result.stderr || `exit ${result.status}`,
        spec: {},
      })
    }

    // Tool result: structured envelope as JSON string so hosts/parsers can detect type:"chart"
    const out = (result.stdout || "").trim()
    // Also surface ASCII for TUI readability (stderr from --ascii)
    const ascii = spawnSync(py, [script, "--ascii"], {
      input: payload,
      encoding: "utf-8",
    })
    const asciiText = (ascii.stderr || "").trim()

    if (asciiText) {
      return `${out}\n\n\`\`\`text\n${asciiText}\n\`\`\``
    }
    return out
  },
})
