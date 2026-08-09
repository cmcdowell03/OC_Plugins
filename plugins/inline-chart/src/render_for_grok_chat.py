#!/usr/bin/env python3
"""
Shim: re-export / forward to the Grok chart-in-chat renderer when present,
else use local matplotlib path next to this file.

Preferred install: ~/.grok/skills/chart-in-chat/scripts/render_chart.py
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

CANDIDATES = [
    Path.home() / ".grok" / "skills" / "chart-in-chat" / "scripts" / "render_chart.py",
    Path(__file__).resolve().parent.parent.parent.parent.parent
    / ".grok"
    / "skills"
    / "chart-in-chat"
    / "scripts"
    / "render_chart.py",
]


def main() -> int:
    for c in CANDIDATES:
        if c.is_file():
            sys.argv[0] = str(c)
            runpy.run_path(str(c), run_name="__main__")
            return 0
    # Fallback: tell user
    print(
        "chart-in-chat skill not found. Expected:\n"
        f"  {CANDIDATES[0]}",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
