# Agent: chart-agent

Visualization sub-agent for inline charts.

- **Plugin:** `plugins/inline-chart/`
- **Tool:** `create_inline_chart`
- **Mode:** subagent
- **Prompt:** `plugins/inline-chart/prompts/system.md`

## Invoke

Prefer tool calls over code dumps. Envelope:

```json
{ "type": "chart", "renderer": "echarts", "spec": {}, "interactive": true }
```

## Demo

```powershell
python plugins\inline-chart\src\chart_tool.py --demo --ascii
```
