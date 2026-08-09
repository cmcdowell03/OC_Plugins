/**
 * Headless Vega-Lite → SVG → PNG (no browser).
 * Used for rich chart images embeddable in OpenCode tool results / TUI.
 */
import * as vega from "vega"
import * as vegaLite from "vega-lite"
import { Resvg } from "@resvg/resvg-js"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { ChartEnvelope, ChartRequest, ChartType } from "./types.ts"

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return NaN
}

function inferFields(req: ChartRequest): { x: string; y: string } {
  const sample = req.data[0] ?? {}
  const keys = Object.keys(sample)
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]))
  const pick = (...cands: string[]) => {
    for (const c of cands) {
      const h = lower.get(c.toLowerCase())
      if (h) return h
    }
    return undefined
  }
  const x =
    req.x_field ||
    pick("x", "date", "time", "t", "category", "label", "name", "quarter", "month") ||
    keys[0] ||
    "x"
  let y =
    req.y_field ||
    pick("y", "value", "count", "amount", "revenue", "price", "users")
  if (!y) {
    y = keys.find((k) => k !== x && typeof sample[k] === "number") || keys[keys.length - 1] || "y"
  }
  return { x, y }
}

/** Build a Vega-Lite v5 spec from the tool request */
export function buildVegaLiteSpec(req: ChartRequest): Record<string, unknown> {
  const { x, y } = inferFields(req)
  const title = req.title || "Chart"
  const theme = req.options?.theme ?? "dark"
  const height = req.options?.height ?? 360
  const chartType: ChartType = req.chart_type
  const seriesField = req.series_field
  const bg = theme === "dark" ? "#0b0f14" : "#ffffff"
  const fg = theme === "dark" ? "#e7ecf3" : "#1a1a1a"
  const grid = theme === "dark" ? "#243041" : "#d0d7de"

  const config = {
    background: bg,
    title: { color: fg, fontSize: 14 },
    axis: {
      labelColor: fg,
      titleColor: fg,
      gridColor: grid,
      domainColor: grid,
      tickColor: grid,
    },
    legend: { labelColor: fg, titleColor: fg },
    view: { stroke: grid },
  }

  const data = { values: req.data }

  if (chartType === "pie") {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      title,
      height,
      width: 480,
      background: bg,
      config,
      data,
      mark: { type: "arc", tooltip: true, innerRadius: 50 },
      encoding: {
        theta: { field: y, type: "quantitative" },
        color: { field: x, type: "nominal" },
        tooltip: [
          { field: x, type: "nominal" },
          { field: y, type: "quantitative" },
        ],
      },
    }
  }

  const markType =
    chartType === "bar"
      ? "bar"
      : chartType === "scatter"
        ? "point"
        : chartType === "area"
          ? "area"
          : "line"

  const xType = chartType === "scatter" ? "quantitative" : "ordinal"
  // Preserve input row order (critical for quarter labels)
  const xEnc =
    chartType === "scatter"
      ? { field: x, type: xType }
      : { field: x, type: xType, sort: null, axis: { labelAngle: -30 } }
  const encoding: Record<string, unknown> = {
    x: xEnc,
    y: { field: y, type: "quantitative" },
    tooltip: [
      { field: x, type: xType },
      { field: y, type: "quantitative" },
    ],
  }
  if (seriesField) {
    encoding.color = { field: seriesField, type: "nominal" }
  }

  const baseLayer: Record<string, unknown> = {
    data,
    mark: {
      type: markType,
      tooltip: true,
      point: chartType === "line",
      color: seriesField ? undefined : "#3d8bfd",
    },
    encoding,
  }

  // Moving average as second layer (single series)
  const ma = req.options?.moving_average
  const layers: Record<string, unknown>[] = [baseLayer]
  if (ma && ma > 1 && !seriesField && (chartType === "line" || chartType === "area")) {
    layers.push({
      data,
      transform: [
        {
          window: [{ op: "mean", field: y, as: "ma" }],
          frame: [1 - ma, 0],
        },
      ],
      mark: {
        type: "line",
        strokeDash: [6, 4],
        color: "#7ee787",
        strokeWidth: 2,
      },
      encoding: {
        x: chartType === "scatter" ? { field: x, type: xType } : { field: x, type: xType, sort: null },
        y: { field: "ma", type: "quantitative", title: y },
        tooltip: [
          { field: x, type: xType },
          { field: "ma", type: "quantitative", title: `MA(${ma})` },
        ],
      },
    })
  }

  // Rule annotation on x (use same field name as data so scale is shared)
  const anns = req.options?.annotations ?? []
  for (const ann of anns) {
    if (!ann || typeof ann !== "object" || !("x" in ann)) continue
    const label = String((ann as { label?: string }).label ?? (ann as { text?: string }).text ?? "")
    const xv = (ann as { x: unknown }).x
    layers.push({
      data: { values: [{ [x]: xv, label }] },
      mark: { type: "rule", color: "#f5a623", strokeDash: [4, 4], strokeWidth: 1.5 },
      encoding: {
        x: { field: x, type: xType, sort: null },
      },
    })
    layers.push({
      data: { values: [{ [x]: xv, label }] },
      mark: {
        type: "text",
        align: "left",
        dx: 4,
        dy: -8,
        color: "#f5a623",
        fontSize: 11,
      },
      encoding: {
        x: { field: x, type: xType, sort: null },
        y: { value: 28 },
        text: { field: "label" },
      },
    })
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title,
    height,
    width: 640,
    background: bg,
    config,
    layer: layers,
  }
}

export type RenderedChartFiles = {
  pngPath: string
  svgPath: string
  htmlPath: string
  vegaLiteSpec: Record<string, unknown>
  width: number
  height: number
}

export async function renderChartToFiles(
  req: ChartRequest,
  envelope: ChartEnvelope,
  outDir: string,
  basename: string,
): Promise<RenderedChartFiles> {
  const absOut = resolve(outDir)
  mkdirSync(absOut, { recursive: true })

  const vlSpec = buildVegaLiteSpec(req)
  // Compile VL → Vega
  const compiled = vegaLite.compile(vlSpec as vegaLite.TopLevelSpec)
  const vgSpec = compiled.spec

  const view = new vega.View(vega.parse(vgSpec), { renderer: "none" })
  await view.runAsync()
  const svg = await view.toSVG()

  const svgPath = resolve(absOut, `${basename}.svg`)
  const pngPath = resolve(absOut, `${basename}.png`)
  const htmlPath = resolve(absOut, `${basename}.html`)

  writeFileSync(svgPath, svg, "utf8")

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 960 },
    background: req.options?.theme === "light" ? "#ffffff" : "#0b0f14",
  })
  const pngData = resvg.render().asPng()
  writeFileSync(pngPath, pngData)

  // Interactive ECharts HTML (uses envelope.spec when echarts; else embeds VL via vega-embed CDN)
  const html = buildInteractiveHtml(envelope, vlSpec, req.options?.theme ?? "dark")
  writeFileSync(htmlPath, html, "utf8")

  return {
    pngPath,
    svgPath,
    htmlPath,
    vegaLiteSpec: vlSpec,
    width: 960,
    height: req.options?.height ?? 360,
  }
}

function buildInteractiveHtml(
  envelope: ChartEnvelope,
  vlSpec: Record<string, unknown>,
  theme: string,
): string {
  const bg = theme === "dark" ? "#0b0f14" : "#ffffff"
  const fg = theme === "dark" ? "#e7ecf3" : "#1a1a1a"
  const title = envelope.meta.title || "Chart"
  const echartsSpec = JSON.stringify(envelope.spec ?? {})
  const vegaSpec = JSON.stringify(vlSpec)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
  <style>
    :root { color-scheme: ${theme}; }
    body { margin: 0; background: ${bg}; color: ${fg}; font-family: ui-sans-serif, system-ui, sans-serif; }
    header { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-bottom: 1px solid #243041; }
    h1 { font-size: 14px; margin: 0; flex: 1; font-weight: 600; }
    .tabs button { background: #1a2433; color: ${fg}; border: 1px solid #243041; border-radius: 8px; padding: 6px 12px; cursor: pointer; margin-right: 6px; }
    .tabs button.active { border-color: #3d8bfd; background: #152033; }
    #echarts, #vega { width: 100vw; height: calc(100vh - 52px); }
    #vega { display: none; padding: 8px; box-sizing: border-box; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="tabs">
      <button type="button" id="tab-e" class="active">ECharts</button>
      <button type="button" id="tab-v">Vega-Lite</button>
    </div>
  </header>
  <div id="echarts"></div>
  <div id="vega"></div>
  <script>
    const echartsSpec = ${echartsSpec};
    const vegaSpec = ${vegaSpec};
    const chart = echarts.init(document.getElementById('echarts'), null, { renderer: 'canvas' });
    const opt = { ...echartsSpec }; delete opt._height;
    chart.setOption(opt, true);
    window.addEventListener('resize', () => chart.resize());

    const tabE = document.getElementById('tab-e');
    const tabV = document.getElementById('tab-v');
    const elE = document.getElementById('echarts');
    const elV = document.getElementById('vega');
    let vegaReady = false;

    tabE.onclick = () => {
      tabE.classList.add('active'); tabV.classList.remove('active');
      elE.style.display = 'block'; elV.style.display = 'none'; chart.resize();
    };
    tabV.onclick = async () => {
      tabV.classList.add('active'); tabE.classList.remove('active');
      elE.style.display = 'none'; elV.style.display = 'block';
      if (!vegaReady) {
        await vegaEmbed('#vega', vegaSpec, { actions: true, theme: '${theme === "dark" ? "dark" : "excel"}' });
        vegaReady = true;
      }
    };
  </script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
