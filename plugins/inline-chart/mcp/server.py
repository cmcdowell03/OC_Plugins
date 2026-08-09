#!/usr/bin/env python3
"""
Minimal stdio MCP-style tool server for create_inline_chart.

Many hosts (OpenCode MCP, Cursor, custom harnesses) can wrap this.
For full MCP protocol use a proper SDK; this exposes a simple
JSON-lines protocol for harness integration:

  → {"id":1,"method":"create_inline_chart","params":{...}}
  ← {"id":1,"result":{ type: chart, ... }}

Also usable as:
  python server.py --once < request.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow importing sibling chart_tool
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from chart_tool import create_inline_chart_from_request  # noqa: E402


def handle(params: dict) -> dict:
    return create_inline_chart_from_request(params)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--once", action="store_true", help="Single JSON on stdin")
    args = p.parse_args()

    if args.once:
        req = json.loads(sys.stdin.read())
        print(json.dumps(handle(req), indent=2))
        return 0

    # JSON-lines loop
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            mid = msg.get("id")
            method = msg.get("method")
            params = msg.get("params") or msg
            if method and method not in ("create_inline_chart", "tools/call"):
                print(
                    json.dumps(
                        {"id": mid, "error": f"unknown method {method}"}
                    ),
                    flush=True,
                )
                continue
            if "params" in msg and "name" in (msg.get("params") or {}):
                # MCP-ish tools/call shape
                params = (msg["params"].get("arguments") or params)
            result = handle(params if "chart_type" in params else params)
            print(json.dumps({"id": mid, "result": result}), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
