#!/usr/bin/env python3
"""
Python example (subprocess + multi-agent harness style).

    def call_opencode(prompt: str, session_id: str = None, agent: str = None) -> dict:
"""

from __future__ import annotations

import json
import subprocess
import time


def call_opencode(
    prompt: str,
    session_id: str = None,
    agent: str = None,
) -> dict:
    cmd = ["opencode", "run", "--format", "json"]
    if session_id:
        cmd += ["--continue", "--session", session_id]
    if agent:
        cmd += ["--agent", agent]
    cmd += [prompt]

    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout) if result.stdout else {}


# Example loop in your multi-agent system
def main() -> int:
    session = None
    for i in range(20):
        print(f"=== Iteration {i} ===")
        resp = call_opencode(
            "Analyze recent changes and propose the next improvement step. "
            "Output TASK_COMPLETE when done or a clear blocker.",
            session_id=session,
            agent="refactor-agent",
        )
        session = resp.get("session_id")
        if "TASK_COMPLETE" in str(resp):
            break
        # Feed output into your SHKG / MemSync / reviewer agent, etc.
        time.sleep(1)

    else:
        print("Hit max iterations (20) without TASK_COMPLETE.")
        return 1

    print("Loop finished successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
