import type { ChartEnvelope, ChartRequest, ChartType } from "./types.ts"

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function firstPresent(keys: string[], cands: string[]): string | undefined {
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]))
  for (const c of cands) {
    const hit = lower.get(c.toLowerCase())
    if (hit) return hit
  }
  return undefined
}

function inferFields(
  data: Array<Record<string, unknown>>,
  xField?: string,
  yField?: string,
  chartType: ChartType = "line",
): { x: string; y: string } {
  const sample = data[0] ?? {}
  const keys = Object.keys(sample)
  if (chartType === "pie") {
    return {
      x: xField || firstPresent(keys, ["name", "label", "category", "x"]) || keys[0] || "name",
      y: yField || firstPresent(keys, ["value", "y", "count", "amount"]) || keys[keys.length - 1] || "value",
    }
  }
  let x = xField || firstPresent(keys, ["x", "date", "time", "t", "category", "label", "name", "quarter", "month"])
  let y = yField || firstPresent(keys, ["y", "value", "count", "amount", "revenue", "price", "users"])
  if (!x) x = keys[0] || "x"
  if (!y) {
    y =
      keys.find((k) => k !== x && typeof sample[k] === "number") ||
      keys[keys.length - 1] ||
      "y"
  }
  return { x, y }
}

function movingAverage(vals: number[], window: number): Array<number | null> {
  if (window <= 1) return vals.slice()
  const out: Array<number | null> = []
  for (let i = 0; i < vals.length; i++) {
    if (i + 1 < window) out.push(null)
    else {
      let s = 0
      for (let j = i + 1 - window; j <= i; j++) s += vals[j]!
      out.push(s / window)
    }
  }
  return out
}

/** Unicode sparkline for TUI / tool output */
export function renderAscii(
  title: string,
  chartType: ChartType,
  values: number[],
  labels: string[] = [],
  width = 48,
): string {
  const clean = values.filter((v) => Number.isFinite(v))
  if (!clean.length) {
    return `╭─ ${title} (${chartType}) ─╮\n│ (no data)\n╰──────────────────────────╯`
  }
  const lo = Math.min(...clean)
  const hi = Math.max(...clean)
  const span = hi - lo || 1
  const chars = " ▁▂▃▄▅▆▇█"
  const n = Math.min(clean.length, width)
  const step = Math.max(1, Math.floor(clean.length / n))
  const sampled = clean.filter((_, i) => i % step === 0).slice(0, n)
  const spark = sampled
    .map((v) => {
      const idx = Math.min(chars.length - 1, Math.floor(((v - lo) / span) * (chars.length - 1)))
      return chars[idx]
    })
    .join("")
  const labelLine =
    labels.length > 1
      ? `│ ${labels[0]} … ${labels[Math.floor(labels.length / 2)]} … ${labels[labels.length - 1]}\n`
      : ""
  return (
    `╭─ ${title} (${chartType}) ─╮\n` +
    `│ ${spark}\n` +
    `│ min=${formatNum(lo)} max=${formatNum(hi)} n=${clean.length}\n` +
    labelLine +
    `╰──────────────────────────╯`
  )
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1000) return n.toFixed(0)
  if (Number.isInteger(n)) return String(n)
  return n.toPrecision(4).replace(/\.?0+$/, "")
}

export function buildChart(req: ChartRequest): ChartEnvelope {
  const data = req.data ?? []
  if (!data.length) {
    return {
      type: "chart",
      renderer: "echarts",
      spec: {},
      interactive: false,
      meta: {
        data_points: 0,
        chart_type: req.chart_type,
        title: req.title,
        generated_at: new Date().toISOString(),
      },
      ascii: "(empty data)",
      error: "data array is empty",
    }
  }

  const options = req.options ?? {}
  const theme = options.theme ?? "dark"
  const { x: xField, y: yField } = inferFields(data, req.x_field, req.y_field, req.chart_type)
  const seriesField = req.series_field
  const title = req.title || "Chart"
  const bg = theme === "dark" ? "#0f1419" : "#ffffff"
  const fg = theme === "dark" ? "#e7ecf3" : "#1a1a1a"
  const grid = theme === "dark" ? "#2a3340" : "#e0e0e0"

  // Categories + primary series values (for ASCII + simple cartesian)
  const categories: unknown[] = []
  const seen = new Set<unknown>()
  for (const row of data) {
    const xv = row[xField]
    if (!seen.has(xv)) {
      seen.add(xv)
      categories.push(xv)
    }
  }

  const yByX = new Map<unknown, number>()
  for (const row of data) {
    // last write wins for single series
    if (!seriesField) yByX.set(row[xField], num(row[yField]))
  }
  let primaryVals = categories.map((c) => yByX.get(c) ?? 0)

  // Multi-series: use first series for ASCII sparkline
  if (seriesField) {
    const firstSeries = String(data[0]?.[seriesField] ?? "series")
    primaryVals = categories.map((c) => {
      const row = data.find((r) => r[xField] === c && String(r[seriesField]) === firstSeries)
      return row ? num(row[yField]) : 0
    })
  }

  const series: Array<Record<string, unknown>> = []

  if (req.chart_type === "pie") {
    series.push({
      type: "pie",
      radius: ["35%", "65%"],
      data: data.map((r) => ({ name: String(r[xField] ?? ""), value: num(r[yField]) })),
    })
  } else if (seriesField && req.chart_type !== "scatter") {
    const names: string[] = []
    const nseen = new Set<string>()
    for (const r of data) {
      const s = String(r[seriesField] ?? "series")
      if (!nseen.has(s)) {
        nseen.add(s)
        names.push(s)
      }
    }
    const lookup = new Map<string, number>()
    for (const r of data) {
      lookup.set(`${r[seriesField]}||${r[xField]}`, num(r[yField]))
    }
    for (const name of names) {
      const vals = categories.map((c) => lookup.get(`${name}||${c}`) ?? null)
      const s: Record<string, unknown> = {
        name,
        type: req.chart_type === "bar" ? "bar" : "line",
        data: vals,
        smooth: req.chart_type === "line" || req.chart_type === "area",
      }
      if (req.chart_type === "area") s.areaStyle = {}
      series.push(s)
    }
  } else if (req.chart_type === "scatter") {
    series.push({
      name: yField,
      type: "scatter",
      data: data.map((r) => [num(r[xField]), num(r[yField])]),
      symbolSize: 10,
    })
  } else {
    const s: Record<string, unknown> = {
      name: yField,
      type: req.chart_type === "bar" ? "bar" : "line",
      data: primaryVals,
      smooth: req.chart_type === "line" || req.chart_type === "area",
    }
    if (req.chart_type === "area") s.areaStyle = {}
    series.push(s)
  }

  const ma = options.moving_average
  if (ma && ma > 1 && primaryVals.length && req.chart_type !== "pie" && req.chart_type !== "scatter") {
    series.push({
      name: `MA(${ma})`,
      type: "line",
      data: movingAverage(primaryVals, ma),
      smooth: true,
      showSymbol: false,
      lineStyle: { type: "dashed", width: 2 },
    })
  }

  // Annotations → markLine on first series
  const annotations = options.annotations ?? []
  if (annotations.length && series[0] && req.chart_type !== "pie") {
    const markLines = []
    for (const ann of annotations) {
      if (ann && typeof ann === "object" && "x" in ann) {
        markLines.push({
          name: String((ann as { label?: string }).label ?? (ann as { text?: string }).text ?? ""),
          xAxis: (ann as { x: unknown }).x,
          label: { formatter: String((ann as { label?: string }).label ?? "") },
          lineStyle: { type: "dashed", color: "#f5a623" },
        })
      }
    }
    if (markLines.length) {
      series[0]!.markLine = { data: markLines, symbol: ["none", "none"] }
    }
  }

  const spec: Record<string, unknown> = {
    backgroundColor: bg,
    textStyle: { color: fg },
    title: {
      text: title,
      left: "center",
      textStyle: { color: fg, fontSize: 16 },
    },
    tooltip: { trigger: req.chart_type === "pie" || req.chart_type === "scatter" ? "item" : "axis" },
    legend: {
      show: options.show_legend !== false,
      textStyle: { color: fg },
      top: 28,
    },
    grid: { left: 48, right: 24, top: 72, bottom: 48, containLabel: true },
    series,
    _height: options.height ?? 420,
  }

  if (req.chart_type !== "pie") {
    if (req.chart_type === "scatter") {
      spec.xAxis = { type: "value", name: xField, axisLabel: { color: fg }, splitLine: { lineStyle: { color: grid } } }
      spec.yAxis = { type: "value", name: yField, axisLabel: { color: fg }, splitLine: { lineStyle: { color: grid } } }
    } else {
      spec.xAxis = {
        type: "category",
        data: categories,
        axisLabel: { color: fg },
        axisLine: { lineStyle: { color: grid } },
        splitLine: { lineStyle: { color: grid } },
      }
      spec.yAxis = {
        type: "value",
        axisLabel: { color: fg },
        splitLine: { lineStyle: { color: grid } },
      }
    }
  }

  const ascii = renderAscii(
    title,
    req.chart_type,
    primaryVals,
    categories.map(String),
  )

  return {
    type: "chart",
    renderer: options.renderer === "vega-lite" ? "vega-lite" : "echarts",
    spec,
    interactive: options.interactive !== false,
    meta: {
      data_points: data.length,
      chart_type: req.chart_type,
      title,
      x_field: xField,
      y_field: yField,
      series_field: seriesField,
      generated_at: new Date().toISOString(),
    },
    ascii,
  }
}

/**
 * Text shown alongside the image attachment in the chat.
 * PNG is also delivered via ToolResult.attachments and (when provided)
 * as a markdown data-URL image for hosts that only render markdown.
 */
export function formatToolOutput(
  envelope: ChartEnvelope,
  opts?: { pngDataUrl?: string },
): string {
  if (envelope.error) {
    return JSON.stringify(envelope, null, 2)
  }

  const title = envelope.meta.title || "Chart"
  const lines: string[] = [`### ${title}`, ""]

  // Markdown image (data URL) — some hosts render this even when attachments are ignored
  if (opts?.pngDataUrl) {
    lines.push(`![${title}](${opts.pngDataUrl})`)
    lines.push("")
  }

  lines.push(envelope.ascii)
  lines.push("")
  lines.push(
    `_${envelope.meta.chart_type} · ${envelope.meta.data_points} points · image attached_`,
  )

  // Keep envelope without embedding base64 again (size)
  const meta = { ...envelope.meta }
  lines.push("")
  lines.push("```chart")
  lines.push(
    JSON.stringify(
      {
        type: envelope.type,
        renderer: envelope.renderer,
        interactive: envelope.interactive,
        meta,
        spec: envelope.spec,
        vegaLiteSpec: envelope.vegaLiteSpec,
      },
      null,
      2,
    ),
  )
  lines.push("```")
  return lines.join("\n")
}
