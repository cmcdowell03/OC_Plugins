# Chart quick reference

## If no chart showed inline

OpenCode probably **did not call** `create_inline_chart` and only printed a path like:

```text
Existing chart: OC_Plugins/runs/charts/q_revenue_ma3_q3.png
```

That **never** displays an image. Paths are text.

## Correct behavior

1. Read `data/quarterly_revenue.json`
2. **Call tool** `create_inline_chart` with that JSON
3. Tool returns:
   - `attachments[]` with `mime: image/png` (data URL)
   - markdown `![...](data:image/png;base64,...)` in the tool text

## Paste this into OpenCode

```text
Call create_inline_chart now using data/quarterly_revenue.json.
Do not mention existing PNG paths. Do not skip the tool.
```
