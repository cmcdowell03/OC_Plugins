/** Shared chart envelope — same shape as OC_Plugins inline-chart / Grok skill */

export type ChartType =
  | "line"
  | "bar"
  | "scatter"
  | "pie"
  | "area"
  | "heatmap"
  | "candlestick"
  | "boxplot"

export type ChartOptions = {
  show_trendline?: boolean
  show_legend?: boolean
  interactive?: boolean
  theme?: "dark" | "light"
  annotations?: Array<Record<string, unknown>>
  height?: number
  moving_average?: number
  renderer?: "echarts" | "vega-lite"
}

export type ChartRequest = {
  chart_type: ChartType
  title?: string
  data: Array<Record<string, unknown>>
  x_field?: string
  y_field?: string
  series_field?: string
  options?: ChartOptions
}

export type ChartEnvelope = {
  type: "chart"
  renderer: "echarts" | "vega-lite"
  spec: Record<string, unknown>
  /** Vega-Lite spec when available (for dual renderers) */
  vegaLiteSpec?: Record<string, unknown>
  interactive: boolean
  meta: {
    data_points: number
    chart_type: ChartType
    title?: string
    x_field?: string
    y_field?: string
    series_field?: string
    generated_at: string
    png?: string
    svg?: string
    html?: string
  }
  ascii: string
  error?: string
}

export const CHART_PLUGIN_ID = "oc-plugins.inline-chart"
export const CHART_TOOL_NAME = "create_inline_chart"
export const CHART_ROUTE = "oc-plugins.chart"
export const CHART_KV_LAST = "oc-plugins.inline-chart:last"
export const CHART_KV_HISTORY = "oc-plugins.inline-chart:history"
