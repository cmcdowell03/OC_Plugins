# OC_Plugins — agent instructions

## CRITICAL — Charts

When the user asks to **plot / chart / graph / visualize**:

### You MUST

1. Call the tool **`create_inline_chart`** (required).
2. Pass real `data` (array of objects). For the quarterly demo, read **`data/quarterly_revenue.json`** and pass its fields into the tool.
3. Let the tool attach an **image/png** into the chat.

### You MUST NOT

1. **Only** point at an existing PNG like `runs/charts/q_revenue_ma3_q3.png` — that is text, **nothing renders inline**.
2. Say “Existing chart: path/to.png” without calling the tool.
3. Dump matplotlib/plotly code instead of calling the tool.
4. Open a browser.

### Why “Existing chart: …png” failed

A file path in the reply is **not** an image attachment. The chat only shows a chart if:

- `create_inline_chart` runs and returns `attachments: [{ mime: "image/png", url: "data:image/png;base64,..." }]`, or
- markdown `![...](data:image/png;base64,...)` is in the tool output and the host renders it.

### Demo call (quarterly revenue)

Read `data/quarterly_revenue.json`, then:

```
create_inline_chart({
  chart_type: "line",
  title: "Quarterly revenue with 3-period MA + Q3-24 spike",
  x_field: "quarter",
  y_field: "revenue",
  data: <from file>,
  options: {
    theme: "dark",
    moving_average: 3,
    annotations: [{ "x": "Q3-24", "label": "Q3-24 spike" }]
  }
})
```

## Plugin location

`plugins/opencode-inline-chart/` · tool name **`create_inline_chart`**
