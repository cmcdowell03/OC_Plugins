/**
 * Bun smoke test — no OpenCode host required.
 *   bun run scripts/smoke-test.ts
 */
import { buildChart, formatToolOutput } from "../src/chart/build.ts"

const env = buildChart({
  chart_type: "line",
  title: "Quarterly revenue with 3-month MA + Q3 spike",
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
    annotations: [{ x: "Q3-24", label: "Q3 spike" }],
  },
})

console.log(formatToolOutput(env))
console.log("\n--- meta ---")
console.log(JSON.stringify(env.meta, null, 2))
if (env.error) process.exit(1)
