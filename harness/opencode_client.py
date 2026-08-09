"""
Shared OpenCode client helpers for plugin harnesses.

Import from examples or your own orchestration:

    from harness.opencode_client import OpenCodeClient
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field
from typing import Any


SESSION_ID_RE = re.compile(
    r'"session(?:_id|ID)?"\s*:\s*"([^"]+)"',
    re.IGNORECASE,
)


@dataclass
class OpenCodeResult:
    returncode: int
    stdout: str
    stderr: str
    session_id: str | None = None
    events: list[Any] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.returncode == 0

    @property
    def raw(self) -> str:
        if self.stderr:
            return f"{self.stdout}\n{self.stderr}"
        return self.stdout

    @property
    def task_complete(self) -> bool:
        return "TASK_COMPLETE" in self.raw


class OpenCodeClient:
    """Thin wrapper around the OpenCode CLI (and optional attach URL)."""

    def __init__(
        self,
        *,
        model: str | None = None,
        attach: str | None = None,
        agent: str | None = None,
        auto: bool = False,
        binary: str = "opencode",
    ) -> None:
        self.model = model
        self.attach = attach
        self.agent = agent
        self.auto = auto
        self.binary = binary
        self.session_id: str | None = None

    def run(
        self,
        prompt: str,
        *,
        session_id: str | None = None,
        continue_session: bool | None = None,
        fork: bool = False,
        extra_args: list[str] | None = None,
        timeout: int | None = None,
    ) -> OpenCodeResult:
        sid = session_id if session_id is not None else self.session_id
        cont = continue_session if continue_session is not None else bool(sid)

        cmd: list[str] = [self.binary, "run", "--format", "json"]
        if self.model:
            cmd += ["--model", self.model]
        if self.attach:
            cmd += ["--attach", self.attach]
        if sid:
            if cont:
                cmd += ["--continue", "--session", sid]
            else:
                cmd += ["--session", sid]
        if self.agent:
            cmd += ["--agent", self.agent]
        if self.auto:
            cmd += ["--auto"]
        if fork:
            cmd += ["--fork"]
        if extra_args:
            cmd += list(extra_args)
        cmd += [prompt]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        stdout = result.stdout or ""
        stderr = result.stderr or ""
        raw = stdout + ("\n" + stderr if stderr else "")
        new_sid = _extract_session_id(raw) or sid
        if new_sid:
            self.session_id = new_sid

        return OpenCodeResult(
            returncode=result.returncode,
            stdout=stdout,
            stderr=stderr,
            session_id=new_sid,
            events=_parse_json_blobs(stdout),
        )

    def run_loop(
        self,
        prompt_first: str,
        prompt_next: str,
        *,
        max_iter: int = 10,
        sleep_secs: float = 2.0,
        on_iteration=None,
    ) -> OpenCodeResult:
        import time

        last: OpenCodeResult | None = None
        for i in range(max_iter):
            prompt = prompt_first if not self.session_id else prompt_next
            last = self.run(prompt, continue_session=bool(self.session_id))
            if on_iteration:
                on_iteration(i, last)
            if last.task_complete:
                return last
            time.sleep(sleep_secs)
        assert last is not None
        return last


def _extract_session_id(text: str) -> str | None:
    m = SESSION_ID_RE.search(text or "")
    return m.group(1) if m else None


def _parse_json_blobs(text: str) -> list[Any]:
    text = (text or "").strip()
    if not text:
        return []
    try:
        return [json.loads(text)]
    except json.JSONDecodeError:
        pass
    out: list[Any] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out
