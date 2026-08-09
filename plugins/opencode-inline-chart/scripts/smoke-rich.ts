/**
 * Smoke-test rich Vega PNG + interactive HTML generation.
 *   bun run scripts/smoke-rich.ts
 */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { buildChart, formatToolOutput } from "../src/chart/build.ts"
import { renderChartToFiles } from "../src/chart/vega_render.ts"
import type { ChartRequest } from "../src/chart/types.ts"

const req: ChartRequest = {
  chart_type: "line",
  title: "Quarterly revenue with 3-period MA + Q3-24 spike",
  data: [
    { quarter: "Q1-23", revenue: 4.2 },
    { quarter: "Q2-23", revenue: 4.8 },
    { quarter: "Q3-23", revenue: 7.1 },
    { quarter: "Q4-23", revenue: 5.0 },
    { quarter: "Q1-24", revenue: 5.4 },
    { quarter: "Q2-24", revenue: 5.9 },
    { quarter: "Q3-24", revenue: 9.2 },
    { quarter: "Q4-24", revenue: 6.3 },
  ],
  x_field: "quarter",
  y_field: "revenue",
  options: {
    theme: "dark",
    moving_average: 3,
    annotations: [{ x: "Q3-24", label: "Q3-24 spike" }],
    height: 360,
  },
}

const envelope = buildChart(req)
const outDir = join(import.meta.dir, "..", "..", "..", "runs", "opencode-charts")
mkdirSync(outDir, { recursive: true })

const files = await renderChartToFiles(req, envelope, outDir, "smoke_q_revenue")
envelope.meta.png = files.pngPath
envelope.meta.svg = files.svgPath
envelope.meta.html = files.htmlPath
envelope.vegaLiteSpec = files.vegaLiteSpec

console.log(formatToolOutput(envelope))
console.log("\n--- files ---")
console.log(files)

// Open interactive HTML on Windows for visual verification
if (process.platform === "win32") {
  await Bun.$`cmd /c start "" ${files.htmlPath}`.quiet()
  console.log("Opened interactive HTML in browser")
}
