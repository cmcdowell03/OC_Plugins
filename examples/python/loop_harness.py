#!/usr/bin/env python3
"""
OpenCode outer-loop harness (subprocess style) — full-featured variant.

Simple signature (see also simple_loop.py):

    def call_opencode(prompt: str, session_id: str = None, agent: str = None) -> dict:

This module adds model/attach/auto/timeout for production harnesses.

Usage:
  python loop_harness.py --max-iter 5
  python loop_harness.py --attach http://localhost:4096 --agent code-improver
  python simple_loop.py
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


SESSION_ID_RE = re.compile(
    r'"session(?:_id|ID)?"\s*:\s*"([^"]+)"',
    re.IGNORECASE,
)
TASK_COMPLETE_RE = re.compile(r"TASK_COMPLETE", re.IGNORECASE)


def call_opencode(
    prompt: str,
    session_id: str | None = None,
    agent: str | None = None,
    *,
    continue_session: bool | None = None,
    model: str | None = None,
    attach: str | None = None,
    auto: bool = False,
    timeout: int | None = None,
) -> dict[str, Any]:
    """
    Invoke `opencode run` and return a structured result.

    Simple call (matches harness sketch)::

        result = call_opencode(prompt, session_id=sid, agent="code-improver")

    Returns:
      {
        "ok": bool,
        "returncode": int,
        "stdout": str,
        "stderr": str,
        "session_id": str | None,
        "json_events": list[Any],  # best-effort parsed JSON lines/objects
        "task_complete": bool,
        "raw": str,
      }
    """
    # Default: continue when a session id is provided
    if continue_session is None:
        continue_session = bool(session_id)

    cmd: list[str] = ["opencode", "run", "--format", "json"]
    if model:
        cmd += ["--model", model]
    if attach:
        cmd += ["--attach", attach]
    if session_id:
        if continue_session:
            cmd += ["--continue", "--session", session_id]
        else:
            cmd += ["--session", session_id]
    if agent:
        cmd += ["--agent", agent]
    if auto:
        cmd += ["--auto"]
    cmd += [prompt]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    raw = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
    session = extract_session_id(raw) or session_id
    events = try_parse_json_blobs(result.stdout or "")

    return {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "stdout": result.stdout or "",
        "stderr": result.stderr or "",
        "session_id": session,
        "json_events": events,
        "task_complete": bool(TASK_COMPLETE_RE.search(raw)),
        "raw": raw,
    }


def extract_session_id(text: str) -> str | None:
    m = SESSION_ID_RE.search(text or "")
    return m.group(1) if m else None


def try_parse_json_blobs(text: str) -> list[Any]:
    """Parse whole stdout as JSON, else line-delimited JSON objects."""
    text = (text or "").strip()
    if not text:
        return []
    try:
        return [json.loads(text)]
    except json.JSONDecodeError:
        pass
    events: list[Any] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def run_loop(
    *,
    max_iter: int,
    model: str | None,
    attach: str | None,
    agent: str | None,
    auto: bool,
    sleep_secs: float,
    prompt_first: str,
    prompt_next: str,
    log_dir: Path | None,
) -> int:
    session_id: str | None = None
    if log_dir:
        log_dir.mkdir(parents=True, exist_ok=True)

    for i in range(max_iter):
        print(f"=== Iteration {i} ===", flush=True)
        prompt = prompt_first if not session_id else prompt_next
        result = call_opencode(
            prompt,
            session_id,
            agent,
            model=model,
            attach=attach,
            auto=auto,
        )
        if result["session_id"]:
            session_id = result["session_id"]

        if log_dir:
            out = log_dir / f"iteration_{i:03d}.json"
            out.write_text(json.dumps(result, indent=2), encoding="utf-8")
            print(f"wrote {out}", flush=True)

        tail = result["raw"][-2000:]
        print(tail, flush=True)

        if result["task_complete"]:
            print("Loop finished successfully (TASK_COMPLETE).", flush=True)
            return 0

        time.sleep(sleep_secs)

    print(f"Hit max_iter={max_iter} without TASK_COMPLETE.", flush=True)
    return 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="OpenCode iterative loop harness")
    p.add_argument("--max-iter", type=int, default=10)
    p.add_argument("--model", default=None)
    p.add_argument("--attach", default=None, help="e.g. http://localhost:4096")
    p.add_argument("--agent", default=None)
    p.add_argument("--auto", action="store_true", help="pass --auto (use carefully)")
    p.add_argument("--sleep", type=float, default=2.0)
    p.add_argument(
        "--log-dir",
        type=Path,
        default=None,
        help="optional directory for per-iteration JSON dumps",
    )
    p.add_argument(
        "--prompt-first",
        default=(
            "Improve the module based on previous feedback. "
            "Focus on performance and tests. "
            "When fully done, end with TASK_COMPLETE: <summary>."
        ),
    )
    p.add_argument(
        "--prompt-next",
        default=(
            "Continue improving based on the last changes and test results. "
            "When fully done, end with TASK_COMPLETE: <summary>."
        ),
    )
    args = p.parse_args(argv)

    return run_loop(
        max_iter=args.max_iter,
        model=args.model,
        attach=args.attach,
        agent=args.agent,
        auto=args.auto,
        sleep_secs=args.sleep,
        prompt_first=args.prompt_first,
        prompt_next=args.prompt_next,
        log_dir=args.log_dir,
    )


if __name__ == "__main__":
    sys.exit(main())
