#!/usr/bin/env python3
"""
create_inline_chart — declarative chart tool for OpenCode / harnesses.

Preferred path: normalize input → ECharts (or Vega-Lite) JSON spec.
No arbitrary code execution.

Usage (CLI):
  python chart_tool.py --input request.json
  python chart_tool.py --demo
  echo '{...}' | python chart_tool.py

Returns structured envelope:
  {
    "type": "chart",
    "renderer": "echarts",
    "spec": { ... },
    "interactive": true,
    "meta": { "data_points": N, "generated_at": "..." }
  }
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_inline_chart(
    chart_type: str,
    data: list[dict],
    title: str | None = None,
    x_field: str | None = None,
    y_field: str | None = None,
    series_field: str | None = None,
    options: dict | None = None,
) -> dict[str, Any]:
    """Build a structured chart envelope from tool args."""
    options = options or {}
    renderer = (options.get("renderer") or "echarts").lower()
    interactive = options.get("interactive", True)

    if not data:
        return _error_envelope("data array is empty")

    x_field, y_field = _infer_fields(data, x_field, y_field, chart_type)

    if renderer == "vega-lite":
        spec = build_vega_lite_spec(
            chart_type, data, title, x_field, y_field, series_field, options
        )
    else:
        spec = build_echarts_spec(
            chart_type, data, title, x_field, y_field, series_field, options
        )
        renderer = "echarts"

    return {
        "type": "chart",
        "renderer": renderer,
        "spec": spec,
        "interactive": bool(interactive),
        "meta": {
            "data_points": len(data),
            "chart_type": chart_type,
            "title": title,
            "x_field": x_field,
            "y_field": y_field,
            "series_field": series_field,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def create_inline_chart_from_request(req: dict) -> dict[str, Any]:
    """Accept full tool-call style object."""
    return create_inline_chart(
        chart_type=req["chart_type"],
        data=req.get("data") or [],
        title=req.get("title"),
        x_field=req.get("x_field"),
        y_field=req.get("y_field"),
        series_field=req.get("series_field"),
        options=req.get("options") or {},
    )


# ---------------------------------------------------------------------------
# Field inference
# ---------------------------------------------------------------------------

def _infer_fields(
    data: list[dict],
    x_field: str | None,
    y_field: str | None,
    chart_type: str,
) -> tuple[str, str]:
    sample = data[0]
    keys = list(sample.keys())

    if chart_type == "pie":
        # name / value convention
        x = x_field or _first_present(keys, ["name", "label", "category", "x"]) or keys[0]
        y = y_field or _first_present(keys, ["value", "y", "count", "amount"]) or keys[-1]
        return x, y

    if not x_field:
        x_field = _first_present(keys, ["x", "date", "time", "t", "category", "label", "name"])
        if not x_field:
            x_field = keys[0]
    if not y_field:
        y_field = _first_present(keys, ["y", "value", "count", "amount", "revenue", "price"])
        if not y_field:
            # first numeric field not equal to x
            for k in keys:
                if k != x_field and _is_number(sample.get(k)):
                    y_field = k
                    break
            if not y_field:
                y_field = keys[-1] if keys[-1] != x_field else keys[0]
    return x_field, y_field


def _first_present(keys: list[str], candidates: Iterable[str]) -> str | None:
    lower = {k.lower(): k for k in keys}
    for c in candidates:
        if c.lower() in lower:
            return lower[c.lower()]
    return None


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# ---------------------------------------------------------------------------
# ECharts builder (declarative)
# ---------------------------------------------------------------------------

def build_echarts_spec(
    chart_type: str,
    data: list[dict],
    title: str | None,
    x_field: str,
    y_field: str,
    series_field: str | None,
    options: dict,
) -> dict[str, Any]:
    theme = options.get("theme") or "dark"
    show_legend = options.get("show_legend", True)
    height = options.get("height", 420)
    annotations = options.get("annotations") or []
    show_trendline = options.get("show_trendline", False)
    ma_window = options.get("moving_average")

    bg = "#0f1419" if theme == "dark" else "#ffffff"
    fg = "#e7ecf3" if theme == "dark" else "#1a1a1a"
    grid_color = "#2a3340" if theme == "dark" else "#e0e0e0"

    base: dict[str, Any] = {
        "backgroundColor": bg,
        "textStyle": {"color": fg},
        "title": {
            "text": title or "",
            "left": "center",
            "textStyle": {"color": fg, "fontSize": 16},
        },
        "tooltip": {"trigger": "axis" if chart_type not in ("pie", "scatter") else "item"},
        "legend": {"show": show_legend, "textStyle": {"color": fg}, "top": 28},
        "grid": {"left": 48, "right": 24, "top": 72, "bottom": 48, "containLabel": True},
        # host may use height meta; ECharts itself sizes to container
        "_height": height,
    }

    if chart_type == "pie":
        base["tooltip"] = {"trigger": "item"}
        base["series"] = [
            {
                "type": "pie",
                "radius": ["35%", "65%"],
                "data": [
                    {"name": str(row.get(x_field, "")), "value": _num(row.get(y_field))}
                    for row in data
                ],
                "emphasis": {
                    "itemStyle": {
                        "shadowBlur": 10,
                        "shadowOffsetX": 0,
                        "shadowColor": "rgba(0,0,0,0.4)",
                    }
                },
            }
        ]
        return _with_annotations_mark(base, annotations, chart_type)

    if chart_type == "heatmap":
        return _echarts_heatmap(base, data, x_field, y_field, series_field, options)

    if chart_type == "candlestick":
        return _echarts_candlestick(base, data, x_field, options)

    if chart_type == "boxplot":
        return _echarts_boxplot(base, data, x_field, y_field, series_field)

    # line / bar / area / scatter (+ multi-series)
    categories, series_list = _cartesian_series(
        data, x_field, y_field, series_field, chart_type
    )

    base["xAxis"] = {
        "type": "category" if chart_type != "scatter" else "value",
        "data": categories if chart_type != "scatter" else None,
        "axisLabel": {"color": fg},
        "axisLine": {"lineStyle": {"color": grid_color}},
        "splitLine": {"lineStyle": {"color": grid_color}},
    }
    if chart_type == "scatter":
        base["xAxis"] = {
            "type": "value",
            "name": x_field,
            "axisLabel": {"color": fg},
            "splitLine": {"lineStyle": {"color": grid_color}},
        }
        base["yAxis"] = {
            "type": "value",
            "name": y_field,
            "axisLabel": {"color": fg},
            "splitLine": {"lineStyle": {"color": grid_color}},
        }
        base["series"] = series_list
        base["tooltip"] = {"trigger": "item"}
    else:
        base["yAxis"] = {
            "type": "value",
            "axisLabel": {"color": fg},
            "splitLine": {"lineStyle": {"color": grid_color}},
        }
        base["series"] = series_list

    # Moving average on first numeric series
    if ma_window and chart_type in ("line", "area", "bar") and series_list:
        first = series_list[0]
        vals = first.get("data") or []
        ma = _moving_average([_num(v) for v in vals], int(ma_window))
        series_list.append(
            {
                "name": f"MA({ma_window})",
                "type": "line",
                "data": ma,
                "smooth": True,
                "showSymbol": False,
                "lineStyle": {"type": "dashed", "width": 2},
            }
        )

    # Simple least-squares trendline on first series
    if show_trendline and chart_type in ("line", "area", "scatter", "bar") and series_list:
        first_data = series_list[0].get("data") or []
        if chart_type == "scatter":
            pts = [(_num(p[0]), _num(p[1])) for p in first_data if isinstance(p, (list, tuple))]
        else:
            pts = [(i, _num(v)) for i, v in enumerate(first_data)]
        trend = _linear_trend(pts)
        if trend is not None:
            if chart_type == "scatter":
                xs = [p[0] for p in pts]
                x0, x1 = min(xs), max(xs)
                y0 = trend["slope"] * x0 + trend["intercept"]
                y1 = trend["slope"] * x1 + trend["intercept"]
                series_list.append(
                    {
                        "name": "trendline",
                        "type": "line",
                        "data": [[x0, y0], [x1, y1]],
                        "showSymbol": False,
                        "lineStyle": {"type": "dotted", "width": 2},
                    }
                )
            else:
                n = len(first_data)
                series_list.append(
                    {
                        "name": "trendline",
                        "type": "line",
                        "data": [
                            trend["slope"] * i + trend["intercept"] for i in range(n)
                        ],
                        "showSymbol": False,
                        "lineStyle": {"type": "dotted", "width": 2},
                    }
                )

    base["series"] = series_list
    return _with_annotations_mark(base, annotations, chart_type)


def _cartesian_series(
    data: list[dict],
    x_field: str,
    y_field: str,
    series_field: str | None,
    chart_type: str,
) -> tuple[list[Any], list[dict]]:
    echarts_type = {
        "line": "line",
        "area": "line",
        "bar": "bar",
        "scatter": "scatter",
    }.get(chart_type, "line")

    if chart_type == "scatter":
        if series_field:
            groups: dict[str, list] = {}
            for row in data:
                key = str(row.get(series_field, "series"))
                groups.setdefault(key, []).append(
                    [_num(row.get(x_field)), _num(row.get(y_field))]
                )
            series = [
                {"name": k, "type": "scatter", "data": v, "symbolSize": 10}
                for k, v in groups.items()
            ]
        else:
            series = [
                {
                    "name": y_field,
                    "type": "scatter",
                    "data": [
                        [_num(r.get(x_field)), _num(r.get(y_field))] for r in data
                    ],
                    "symbolSize": 10,
                }
            ]
        return [], series

    # Preserve order of x categories
    categories: list[Any] = []
    seen = set()
    for row in data:
        xv = row.get(x_field)
        if xv not in seen:
            seen.add(xv)
            categories.append(xv)

    if series_field:
        series_names: list[str] = []
        sn_seen = set()
        for row in data:
            s = str(row.get(series_field, "series"))
            if s not in sn_seen:
                sn_seen.add(s)
                series_names.append(s)
        # map (series, x) -> y
        lookup = {
            (str(r.get(series_field, "series")), r.get(x_field)): _num(r.get(y_field))
            for r in data
        }
        series = []
        for sname in series_names:
            vals = [lookup.get((sname, c), None) for c in categories]
            s: dict[str, Any] = {
                "name": sname,
                "type": echarts_type,
                "data": vals,
                "smooth": chart_type in ("line", "area"),
            }
            if chart_type == "area":
                s["areaStyle"] = {}
            series.append(s)
        return categories, series

    vals = []
    cat_to_y = {r.get(x_field): _num(r.get(y_field)) for r in data}
    for c in categories:
        vals.append(cat_to_y.get(c))
    s = {
        "name": y_field,
        "type": echarts_type,
        "data": vals,
        "smooth": chart_type in ("line", "area"),
    }
    if chart_type == "area":
        s["areaStyle"] = {}
    return categories, [s]


def _echarts_heatmap(
    base: dict,
    data: list[dict],
    x_field: str,
    y_field: str,
    series_field: str | None,
    options: dict,
) -> dict:
    # Expect rows with x, y, value (series_field or "value")
    v_field = series_field or "value"
    if v_field == y_field:
        v_field = "value" if "value" in (data[0] or {}) else y_field

    xs, ys = [], []
    x_seen, y_seen = set(), set()
    for row in data:
        x, y = row.get(x_field), row.get(y_field)
        if x not in x_seen:
            x_seen.add(x)
            xs.append(x)
        if y not in y_seen:
            y_seen.add(y)
            ys.append(y)
    x_index = {v: i for i, v in enumerate(xs)}
    y_index = {v: i for i, v in enumerate(ys)}
    points = []
    for row in data:
        points.append(
            [
                x_index[row.get(x_field)],
                y_index[row.get(y_field)],
                _num(row.get(v_field)),
            ]
        )
    vmax = max((p[2] for p in points), default=1) or 1
    base["tooltip"] = {"position": "top"}
    base["xAxis"] = {"type": "category", "data": xs, "splitArea": {"show": True}}
    base["yAxis"] = {"type": "category", "data": ys, "splitArea": {"show": True}}
    base["visualMap"] = {
        "min": 0,
        "max": vmax,
        "calculable": True,
        "orient": "horizontal",
        "left": "center",
        "bottom": 8,
    }
    base["series"] = [
        {
            "name": v_field,
            "type": "heatmap",
            "data": points,
            "label": {"show": False},
            "emphasis": {"itemStyle": {"shadowBlur": 10}},
        }
    ]
    return base


def _echarts_candlestick(
    base: dict, data: list[dict], x_field: str, options: dict
) -> dict:
    # Expect open, high, low, close
    cats = [r.get(x_field) for r in data]
    ohlc = [
        [
            _num(r.get("open")),
            _num(r.get("close")),
            _num(r.get("low")),
            _num(r.get("high")),
        ]
        for r in data
    ]
    base["xAxis"] = {"type": "category", "data": cats}
    base["yAxis"] = {"type": "value", "scale": True}
    base["series"] = [{"type": "candlestick", "name": "OHLC", "data": ohlc}]
    return base


def _echarts_boxplot(
    base: dict,
    data: list[dict],
    x_field: str,
    y_field: str,
    series_field: str | None,
) -> dict:
    # Group y values by x (or series)
    groups: dict[str, list[float]] = {}
    for row in data:
        key = str(row.get(series_field or x_field, "all"))
        groups.setdefault(key, []).append(_num(row.get(y_field)))
    cats = list(groups.keys())
    box_data = []
    for k in cats:
        vals = sorted(groups[k])
        if not vals:
            box_data.append([0, 0, 0, 0, 0])
            continue
        q1 = _percentile(vals, 25)
        med = _percentile(vals, 50)
        q3 = _percentile(vals, 75)
        box_data.append([vals[0], q1, med, q3, vals[-1]])
    base["xAxis"] = {"type": "category", "data": cats}
    base["yAxis"] = {"type": "value"}
    base["series"] = [{"name": "boxplot", "type": "boxplot", "data": box_data}]
    return base


def _with_annotations_mark(
    base: dict, annotations: list, chart_type: str
) -> dict:
    if not annotations or chart_type in ("pie", "heatmap"):
        return base
    # Map simple {x, label, text} annotations to markLine / markPoint on first series
    if not base.get("series"):
        return base
    mark_points = []
    mark_lines = []
    for ann in annotations:
        if not isinstance(ann, dict):
            continue
        label = ann.get("label") or ann.get("text") or ""
        if "x" in ann and "y" in ann:
            mark_points.append(
                {
                    "name": label,
                    "coord": [ann["x"], ann["y"]],
                    "value": label,
                    "itemStyle": {"color": ann.get("color", "#f5a623")},
                }
            )
        elif "x" in ann:
            mark_lines.append(
                {
                    "name": label,
                    "xAxis": ann["x"],
                    "label": {"formatter": label},
                    "lineStyle": {"type": "dashed", "color": ann.get("color", "#f5a623")},
                }
            )
    s0 = base["series"][0]
    if mark_points:
        s0["markPoint"] = {"data": mark_points}
    if mark_lines:
        s0["markLine"] = {"data": mark_lines, "symbol": ["none", "none"]}
    return base


# ---------------------------------------------------------------------------
# Vega-Lite builder
# ---------------------------------------------------------------------------

def build_vega_lite_spec(
    chart_type: str,
    data: list[dict],
    title: str | None,
    x_field: str,
    y_field: str,
    series_field: str | None,
    options: dict,
) -> dict[str, Any]:
    mark = {
        "line": "line",
        "area": "area",
        "bar": "bar",
        "scatter": "point",
        "pie": "arc",
    }.get(chart_type, "line")

    height = options.get("height", 420)
    spec: dict[str, Any] = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "title": title or "",
        "height": height,
        "width": "container",
        "data": {"values": data},
    }

    if chart_type == "pie":
        spec["mark"] = {"type": "arc", "tooltip": True}
        spec["encoding"] = {
            "theta": {"field": y_field, "type": "quantitative"},
            "color": {"field": x_field, "type": "nominal"},
        }
        return spec

    encoding: dict[str, Any] = {
        "x": {
            "field": x_field,
            "type": "quantitative" if chart_type == "scatter" else "ordinal",
        },
        "y": {"field": y_field, "type": "quantitative"},
        "tooltip": [{"field": x_field}, {"field": y_field}],
    }
    if series_field:
        encoding["color"] = {"field": series_field, "type": "nominal"}

    spec["mark"] = {"type": mark, "tooltip": True, "point": chart_type == "line"}
    spec["encoding"] = encoding

    if options.get("show_trendline") and chart_type in ("line", "scatter", "area"):
        # layer with regression
        return {
            "$schema": spec["$schema"],
            "title": title or "",
            "height": height,
            "width": "container",
            "layer": [
                {
                    "data": {"values": data},
                    "mark": spec["mark"],
                    "encoding": encoding,
                },
                {
                    "data": {"values": data},
                    "mark": {"type": "line", "color": "orange", "strokeDash": [4, 4]},
                    "transform": [
                        {
                            "regression": y_field,
                            "on": x_field,
                        }
                    ],
                    "encoding": {
                        "x": encoding["x"],
                        "y": encoding["y"],
                    },
                },
            ],
        }
    return spec


# ---------------------------------------------------------------------------
# ASCII fallback (TUI)
# ---------------------------------------------------------------------------

def render_ascii(envelope: dict, width: int = 56, height: int = 14) -> str:
    """Simple sparkline/bar ASCII for OpenCode TUI fallback."""
    meta = envelope.get("meta") or {}
    title = meta.get("title") or envelope.get("spec", {}).get("title") or "chart"
    if isinstance(title, dict):
        title = title.get("text") or "chart"
    chart_type = meta.get("chart_type") or "line"
    spec = envelope.get("spec") or {}

    lines = [f"╭─ {title} ({chart_type}) " + "─" * max(0, width - len(str(title)) - 12) + "╮"]

    values: list[float] = []
    labels: list[str] = []
    series = spec.get("series") or []
    if series and isinstance(series, list):
        s0 = series[0]
        raw = s0.get("data") or []
        if raw and isinstance(raw[0], (list, tuple)):
            values = [_num(p[1]) if len(p) > 1 else _num(p[0]) for p in raw]
        else:
            values = [_num(v) for v in raw]
        xaxis = (spec.get("xAxis") or {}).get("data") or []
        labels = [str(x) for x in xaxis]

    if not values:
        lines.append("│ (no plottable series)" + " " * (width - 22) + "│")
        lines.append("╰" + "─" * width + "╯")
        return "\n".join(lines)

    lo, hi = min(values), max(values)
    span = (hi - lo) or 1.0
    # downsample to width-4
    n = min(len(values), width - 4)
    step = max(1, len(values) // n)
    sampled = values[::step][:n]

    chars = " ▁▂▃▄▅▆▇█"
    spark = "".join(
        chars[min(len(chars) - 1, int((v - lo) / span * (len(chars) - 1)))]
        for v in sampled
    )
    lines.append("│ " + spark.ljust(width - 2) + "│")
    lines.append(
        "│ "
        + f"min={lo:.4g}  max={hi:.4g}  n={len(values)}".ljust(width - 2)
        + "│"
    )
    if labels:
        first, last = labels[0], labels[-1]
        mid = labels[len(labels) // 2]
        foot = f"{first} … {mid} … {last}"
        lines.append("│ " + foot[: width - 2].ljust(width - 2) + "│")
    lines.append("╰" + "─" * width + "╯")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Math helpers
# ---------------------------------------------------------------------------

def _num(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _moving_average(vals: list[float], window: int) -> list[Optional[float]]:
    if window <= 1:
        return list(vals)
    out: list[Optional[float]] = []
    for i in range(len(vals)):
        if i + 1 < window:
            out.append(None)
        else:
            chunk = vals[i + 1 - window : i + 1]
            out.append(sum(chunk) / window)
    return out


def _linear_trend(pts: list[tuple[float, float]]) -> dict | None:
    if len(pts) < 2:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    n = len(pts)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in pts)
    den = sum((x - mean_x) ** 2 for x in xs)
    if den == 0:
        return None
    slope = num / den
    intercept = mean_y - slope * mean_x
    return {"slope": slope, "intercept": intercept}


def _percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


def _error_envelope(msg: str) -> dict[str, Any]:
    return {
        "type": "chart",
        "renderer": "echarts",
        "spec": {},
        "interactive": False,
        "error": msg,
        "meta": {
            "data_points": 0,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }


# ---------------------------------------------------------------------------
# Demo + CLI
# ---------------------------------------------------------------------------

DEMO_REQUEST = {
    "chart_type": "line",
    "title": "Quarterly revenue with 3-month MA + Q3 spike",
    "data": [
        {"quarter": "Q1-23", "revenue": 4.2},
        {"quarter": "Q2-23", "revenue": 4.8},
        {"quarter": "Q3-23", "revenue": 7.1},
        {"quarter": "Q4-23", "revenue": 5.0},
        {"quarter": "Q1-24", "revenue": 5.4},
        {"quarter": "Q2-24", "revenue": 5.9},
        {"quarter": "Q3-24", "revenue": 9.2},
        {"quarter": "Q4-24", "revenue": 6.3},
    ],
    "x_field": "quarter",
    "y_field": "revenue",
    "options": {
        "theme": "dark",
        "show_legend": True,
        "interactive": True,
        "moving_average": 3,
        "height": 420,
        "annotations": [
            {"x": "Q3-24", "label": "Q3 spike"},
        ],
        "renderer": "echarts",
    },
}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="create_inline_chart tool")
    p.add_argument("--input", "-i", type=Path, help="JSON request file")
    p.add_argument("--demo", action="store_true", help="Run quarterly revenue demo")
    p.add_argument("--ascii", action="store_true", help="Also print ASCII fallback")
    p.add_argument(
        "--out",
        "-o",
        type=Path,
        help="Write envelope JSON to file",
    )
    args = p.parse_args(argv)

    if args.demo:
        req = DEMO_REQUEST
    elif args.input:
        req = json.loads(args.input.read_text(encoding="utf-8"))
    elif not sys.stdin.isatty():
        req = json.loads(sys.stdin.read())
    else:
        p.print_help()
        return 2

    envelope = create_inline_chart_from_request(req)
    text = json.dumps(envelope, indent=2)
    print(text)

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")

    if args.ascii:
        print(render_ascii(envelope), file=sys.stderr)

    return 0 if "error" not in envelope else 1


if __name__ == "__main__":
    raise SystemExit(main())
