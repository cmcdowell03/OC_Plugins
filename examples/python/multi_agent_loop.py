#!/usr/bin/env python3
"""
Advanced pattern: OpenCode as one node in a larger multi-agent loop.

  Planner → OpenCode (implement) → Tester/Reviewer → shared memory → Planner

Replace the stub planner/reviewer/memory with your SHKG / MemSync / supervisor.
"""

from __future__ import annotations

import json
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


# ---------------------------------------------------------------------------
# OpenCode callable node
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Shared memory (files today; swap for Redis Streams / MemSync / SHKG)
# ---------------------------------------------------------------------------

class SharedMemory:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / "state.json"
        self.state: dict[str, Any] = self._load()

    def _load(self) -> dict[str, Any]:
        if self.path.exists():
            return json.loads(self.path.read_text(encoding="utf-8"))
        return {"history": [], "context": {}}

    def update(self, result: dict, meta: dict | None = None) -> None:
        entry = {"result": result, "meta": meta or {}}
        self.state.setdefault("history", []).append(entry)
        # Keep last N to avoid unbounded growth
        self.state["history"] = self.state["history"][-50:]
        self.path.write_text(json.dumps(self.state, indent=2), encoding="utf-8")
        # Optional: per-iteration dump
        n = len(self.state["history"])
        (self.root / f"iteration_{n:03d}.json").write_text(
            json.dumps(entry, indent=2), encoding="utf-8"
        )

    @property
    def context(self) -> dict[str, Any]:
        return self.state.setdefault("context", {})


# ---------------------------------------------------------------------------
# Supervisor / planner stubs (replace with your agents)
# ---------------------------------------------------------------------------

@dataclass
class Plan:
    prompt: str
    agent: str = "refactor-agent"
    session: Optional[str] = None
    done: bool = False
    escalate: bool = False
    reason: str = ""


@dataclass
class Supervisor:
    """Lightweight stand-in for planner + budget control."""

    max_iter: int = 20
    memory: SharedMemory = field(default_factory=lambda: SharedMemory(Path("runs/multi_agent")))
    sessions: dict[str, Optional[str]] = field(default_factory=dict)
    iteration: int = 0

    def decide_next_step(self) -> Plan:
        self.iteration += 1
        if self.iteration > self.max_iter:
            return Plan(
                prompt="",
                done=False,
                escalate=True,
                reason=f"max_iterations ({self.max_iter}) exceeded",
            )

        # Example policy: alternate implement vs test-fixer after failures
        history = self.memory.state.get("history", [])
        last_text = str(history[-1]["result"]) if history else ""

        if "BLOCKER" in last_text.upper():
            return Plan(
                prompt="Address the last BLOCKER if possible; otherwise summarize for human.",
                agent="refactor-agent",
                session=self.sessions.get("refactor-agent"),
            )

        if history and "FAIL" in last_text.upper():
            return Plan(
                prompt="Fix failing tests from the last run. Output TASK_COMPLETE when green.",
                agent="test-fixer",
                session=self.sessions.get("test-fixer"),
            )

        return Plan(
            prompt=(
                "Analyze recent changes and propose the next improvement step. "
                "Output TASK_COMPLETE when done or a clear blocker."
            ),
            agent="refactor-agent",
            session=self.sessions.get("refactor-agent"),
        )

    def review(self, result: dict) -> dict:
        """Stub reviewer — swap for Codex/Cursor/custom reviewer agent."""
        text = str(result)
        return {
            "task_complete": "TASK_COMPLETE" in text,
            "blocker": "BLOCKER" in text.upper(),
            "notes": "stub reviewer: string markers only",
        }


def tests_pass() -> bool:
    """Optional real gate: run pytest/cargo/etc. Stub returns False (markers only)."""
    return False


# ---------------------------------------------------------------------------
# High-level loop
# ---------------------------------------------------------------------------

def run(
    max_iter: int = 20,
    sleep_secs: float = 1.0,
    memory_dir: str = "runs/multi_agent",
) -> int:
    supervisor = Supervisor(
        max_iter=max_iter,
        memory=SharedMemory(Path(memory_dir)),
    )

    while True:
        plan = supervisor.decide_next_step()

        if plan.escalate:
            print(f"ESCALATE: {plan.reason}")
            # Feed into human / other agent in your real harness
            return 2

        if plan.done:
            print("Goal achieved (planner).")
            return 0

        print(f"=== tick {supervisor.iteration} agent={plan.agent} ===")
        result = call_opencode(
            plan.prompt,
            session_id=plan.session,
            agent=plan.agent,
        )

        # Preserve per-agent sessions
        sid = result.get("session_id")
        if sid:
            supervisor.sessions[plan.agent] = sid

        supervisor.memory.update(
            result,
            meta={"agent": plan.agent, "iteration": supervisor.iteration},
        )

        review = supervisor.review(result)
        print(review)

        # Feed output into your SHKG / MemSync / reviewer agent, etc.
        # e.g. memsync.push(result); shkg.ingest(result)

        if review["task_complete"] or tests_pass():
            print("Loop finished successfully.")
            return 0

        if "TASK_COMPLETE" in str(result):
            print("Loop finished successfully (marker in resp).")
            return 0

        time.sleep(sleep_secs)


if __name__ == "__main__":
    raise SystemExit(run())
