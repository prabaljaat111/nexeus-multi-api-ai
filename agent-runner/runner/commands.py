"""execute_command, git tools and managed dev servers. No shell is ever used."""
from __future__ import annotations

import os
import re
import signal
import subprocess
import threading
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any

from .config import Config
from .security import ToolError, resolve_in_root

ALLOWED = {"npm", "npx", "pnpm", "yarn", "node", "python", "python3", "pip", "pip3", "git", "vite", "pytest"}
DENIED_ANYWHERE = {"sudo", "su", "doas", "rm", "dd", "mkfs", "fdisk", "parted", "diskutil", "chmod", "chown", "systemctl", "service", "launchctl",
                   "nmap", "masscan", "curl", "wget", "nc", "ncat", "ssh", "scp", "shutdown", "reboot", "kill", "pkill", "bash", "sh", "zsh", "powershell", "cmd"}
SHELL_META = re.compile(r"[;&|`$<>\n]|\$\(")
SAFE_ENV_KEYS = {"PATH", "HOME", "LANG", "LC_ALL", "TERM", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "NODE_ENV"}


def safe_env() -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k.upper() in SAFE_ENV_KEYS}
    env["CI"] = "1"
    env["NO_COLOR"] = "1"
    env["GIT_TERMINAL_PROMPT"] = "0"
    return env


def _validate(command: str, args: list[str]) -> None:
    exe = command.strip()
    if exe not in ALLOWED:
        raise ToolError("COMMAND_NOT_ALLOWED", f"'{exe}' is not in the allowed command list.")
    for a in args:
        if "\x00" in a:
            raise ToolError("INVALID_ARGUMENT", "Arguments cannot contain null bytes.")
        if a.split("/")[-1] in DENIED_ANYWHERE and exe in {"npx", "node", "python", "python3"}:
            raise ToolError("COMMAND_DENIED", "That command is permanently blocked.")
    joined = " ".join(args)
    if exe in {"python", "python3", "node"} and any(x in args for x in ("-c", "-e", "--eval", "-p", "--print")):
        raise ToolError("COMMAND_DENIED", "Inline code execution is blocked; write a file in the workspace and run it instead.")
    if exe == "git":
        if args and args[0] in {"push", "remote", "config", "credential", "daemon", "filter-branch"}:
            raise ToolError("COMMAND_DENIED", "That git command is not available to the agent.")
        if any(a.startswith(("--upload-pack", "--exec", "-c")) for a in args):
            raise ToolError("COMMAND_DENIED", "That git option is blocked.")
    if SHELL_META.search(joined) and exe in {"npx"}:
        raise ToolError("COMMAND_DENIED", "Shell syntax is not allowed.")


def _truncate(b: bytes, limit: int) -> tuple[str, bool]:
    return b[:limit].decode("utf-8", errors="replace"), len(b) > limit


def run(root: Path, command: str, args: list[str], cwd: str | None, timeout: int, cfg: Config) -> dict[str, Any]:
    _validate(command, args)
    wd = resolve_in_root(root, cwd, must_exist=True)
    if not wd.is_dir():
        raise ToolError("INVALID_CWD", "cwd must be a folder in the workspace.")
    t0 = time.monotonic()
    try:
        proc = subprocess.Popen([command, *args], cwd=wd, env=safe_env(), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                shell=False, start_new_session=True)
    except FileNotFoundError:
        raise ToolError("COMMAND_NOT_FOUND", f"'{command}' is not installed on the runner.") from None
    try:
        out, err = proc.communicate(timeout=timeout)
        timed_out = False
    except subprocess.TimeoutExpired:
        _kill(proc)
        out, err = proc.communicate()
        timed_out = True
    half = cfg.max_command_output // 2
    so, t1 = _truncate(out, half)
    se, t2 = _truncate(err, half)
    return {"exit_code": proc.returncode if not timed_out else None, "stdout": so, "stderr": se, "duration_ms": int((time.monotonic() - t0) * 1000),
            "truncated": t1 or t2, "timed_out": timed_out}


def _kill(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(3)
    except Exception:  # noqa: BLE001
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except Exception:  # noqa: BLE001
            pass


def execute_command(root: Path, a: dict[str, Any], cfg: Config):
    timeout = max(1, min(600, int(a.get("timeout_seconds") or cfg.max_tool_seconds)))
    return run(root, str(a["command"]), [str(x) for x in a.get("args") or []], a.get("cwd"), timeout, cfg)


def git(root: Path, args: list[str], cfg: Config):
    r = run(root, "git", ["--no-pager", *args], None, 60, cfg)
    r["stdout"] = re.sub(r"(https?://)[^/@\s]+@", r"\1[REDACTED]@", r["stdout"])
    return r


GIT = {
    "git_status": lambda root, a, c: git(root, ["status", "--short", "--branch"], c),
    "git_diff": lambda root, a, c: git(root, ["diff", *(["--staged"] if a.get("staged") else []), "--", *([str(resolve_in_root(root, a["path"]).relative_to(root.resolve()))] if a.get("path") else [])], c),
    "git_log": lambda root, a, c: git(root, ["log", "--oneline", "-n", str(max(1, min(50, int(a.get("limit") or 10))))], c),
    "git_branch": lambda root, a, c: git(root, ["branch", "--list"], c),
    "git_checkout": lambda root, a, c: git(root, ["checkout", *(["-b"] if a.get("create") else []), _branch(a["branch"])], c),
    "git_add": lambda root, a, c: git(root, ["add", "--", *[str(resolve_in_root(root, p).relative_to(root.resolve())) for p in a["paths"]]], c),
    "git_commit": lambda root, a, c: git(root, ["commit", "-m", str(a["message"])[:2000]], c),
}


def _branch(b: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9._/-]{1,200}", b) or b.startswith("-") or ".." in b:
        raise ToolError("INVALID_BRANCH", "Invalid branch name.")
    return b


class DevServers:
    def __init__(self) -> None:
        self.items: dict[str, dict[str, Any]] = {}
        self.lock = threading.Lock()

    def start(self, root: Path, a: dict[str, Any], cfg: Config):
        cmd, args = str(a["command"]), [str(x) for x in a.get("args") or []]
        _validate(cmd, args)
        if cmd in {"pip", "pip3", "git"}:
            raise ToolError("COMMAND_NOT_ALLOWED", "That command can't be a dev server.")
        running = [s for s in self.items.values() if s["root"] == str(root) and s["proc"].poll() is None]
        if len(running) >= cfg.max_dev_servers:
            raise ToolError("LIMIT", "Too many dev servers are already running in this workspace.")
        wd = resolve_in_root(root, a.get("cwd"), must_exist=True)
        env = safe_env()
        if a.get("port"):
            env["PORT"] = str(int(a["port"]))
        proc = subprocess.Popen([cmd, *args], cwd=wd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=False, start_new_session=True)
        sid = uuid.uuid4().hex[:12]
        logs: deque[str] = deque(maxlen=1000)
        item = {"id": sid, "root": str(root), "proc": proc, "logs": logs, "summary": " ".join([cmd, *args])[:300], "port": a.get("port"), "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        threading.Thread(target=self._pump, args=(item,), daemon=True).start()
        with self.lock:
            self.items[sid] = item
        time.sleep(2)
        return self._status(item)

    def _pump(self, item):
        for raw in iter(item["proc"].stdout.readline, b""):
            line = raw.decode("utf-8", errors="replace").rstrip()
            item["logs"].append(line[:2000])
            if not item["port"]:
                m = re.search(r"(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})", line)
                if m:
                    item["port"] = int(m.group(1))

    def _status(self, item):
        code = item["proc"].poll()
        status = "running" if code is None else ("stopped" if code in (0, -15, -9) else "failed")
        return {"server_id": item["id"], "command_summary": item["summary"], "status": status, "port": item["port"], "started_at": item["started"], "exit_code": code}

    def get(self, sid: str):
        it = self.items.get(sid)
        if not it:
            raise ToolError("NOT_FOUND", "No managed dev server with that id.")
        return it

    def status(self, root: Path, a, _c):
        if a.get("server_id"):
            return self._status(self.get(a["server_id"]))
        return {"servers": [self._status(i) for i in self.items.values() if i["root"] == str(root)]}

    def stop(self, root: Path | None, a, _c):
        it = self.get(a["server_id"])
        if root is not None and it["root"] != str(root):
            raise ToolError("NOT_FOUND", "No managed dev server with that id in this workspace.")
        if it["proc"].poll() is None:
            _kill(it["proc"])
        return self._status(it)

    def logs(self, root: Path, a, _c):
        it = self.get(a["server_id"])
        n = max(1, min(500, int(a.get("lines") or 100)))
        return {"server_id": it["id"], "lines": list(it["logs"])[-n:]}

    def report(self):
        return [{**{k: v for k, v in self._status(i).items() if k in ("command_summary", "status", "port", "started_at")}, "id": i["id"], "workspace_root": i["root"], "pid": str(i["proc"].pid)} for i in self.items.values()]

    def stop_all(self):
        for it in self.items.values():
            if it["proc"].poll() is None:
                _kill(it["proc"])
