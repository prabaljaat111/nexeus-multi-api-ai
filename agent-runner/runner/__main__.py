"""Agent Runner CLI: `python -m runner pair CODE` then `python -m runner start`.

The runner only makes outbound HTTPS requests to the app (poll/heartbeat/result). It opens no ports.
"""
from __future__ import annotations

import json
import os
import platform
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Any, Callable

import httpx

from . import commands, files, web
from .config import STATE_DIR, TOKEN_FILE, Config, load
from .security import ToolError

VERSION = "1.0.0"
DEV = commands.DevServers()

Handler = Callable[[Path, dict[str, Any], Config], Any]
WORKSPACE_TOOLS: dict[str, Handler] = {
    "list_files": files.list_files, "read_file": files.read_file, "write_file": files.write_file, "edit_file": files.edit_file,
    "delete_file": files.delete_file, "create_directory": files.create_directory, "move_file": files.move_file, "search_files": files.search_files,
    "execute_command": commands.execute_command, **commands.GIT,
    "start_dev_server": DEV.start, "get_dev_server_status": DEV.status, "get_dev_server_logs": DEV.logs,
}


def execute(task: dict[str, Any], cfg: Config) -> dict[str, Any]:
    tool, args = task.get("tool"), task.get("args") or {}
    try:
        if tool == "web_search":
            return {"success": True, "data": web.web_search(args, cfg)}
        if tool == "web_fetch":
            return {"success": True, "data": web.web_fetch(args, cfg)}
        if tool == "stop_dev_server":
            root = _root(task.get("workspace_root")) if task.get("workspace_root") else None
            return {"success": True, "data": DEV.stop(root, args, cfg)}
        if tool in WORKSPACE_TOOLS:
            return {"success": True, "data": WORKSPACE_TOOLS[tool](_root(task.get("workspace_root")), args, cfg)}
        return {"success": False, "error": {"type": "UNKNOWN_TOOL", "message": f"The runner does not provide {tool}."}}
    except ToolError as e:
        return {"success": False, "error": {"type": e.type, "message": e.message}}
    except (KeyError, ValueError, TypeError):
        return {"success": False, "error": {"type": "INVALID_ARGUMENTS", "message": "Invalid tool arguments."}}
    except Exception as e:  # noqa: BLE001 — never leak stack traces
        return {"success": False, "error": {"type": "TOOL_FAILED", "message": f"The tool failed ({type(e).__name__})."}}


_CFG: Config | None = None


def _root(raw: str | None) -> Path:
    """The app may only pick a root the runner itself approved."""
    assert _CFG is not None
    for r in _CFG.roots:
        if raw and str(r) == raw:
            return r
    raise ToolError("WORKSPACE_NOT_APPROVED", "That workspace is not approved on this runner.")


def pair(code: str) -> None:
    app = os.environ.get("APP_URL", "").rstrip("/")
    if not app:
        raise SystemExit("Set APP_URL to your app address.")
    r = httpx.post(f"{app}/api/public/runner/pair", json={"code": code, "version": VERSION, "platform": platform.platform()[:80]}, timeout=20)
    if r.status_code != 200:
        raise SystemExit(f"Pairing failed: {r.json().get('error', r.status_code)}")
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    TOKEN_FILE.write_text(json.dumps(r.json()))
    os.chmod(TOKEN_FILE, 0o600)
    print("Paired. Start the runner with: python -m runner start")


def _token() -> str:
    env = os.environ.get("AGENT_RUNNER_TOKEN")
    if env:
        return env
    if not TOKEN_FILE.exists():
        raise SystemExit("Not paired. Run: python -m runner pair <CODE>")
    return json.loads(TOKEN_FILE.read_text())["token"]


def start() -> None:
    global _CFG
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        raise SystemExit("Refusing to run as root. Use a normal user account.")
    cfg = _CFG = load()
    headers = {"authorization": f"Bearer {_token()}"}
    client = httpx.Client(base_url=f"{cfg.app_url}/api/public/runner", headers=headers, timeout=httpx.Timeout(40.0, connect=10.0))
    stop = threading.Event()

    def shutdown(*_):
        stop.set()
        DEV.stop_all()
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    def heartbeat():
        while not stop.is_set():
            try:
                r = client.post("/heartbeat", json={"version": VERSION, "platform": platform.platform()[:80],
                                                   "workspaces": [{"name": p.name, "root": str(p)} for p in cfg.roots], "dev_servers": DEV.report()})
                if r.status_code == 401:
                    print("Runner token rejected (revoked?). Stopping.")
                    shutdown()
            except httpx.HTTPError:
                pass
            stop.wait(15)
    threading.Thread(target=heartbeat, daemon=True).start()
    print(f"Agent Runner {VERSION} connected to {cfg.app_url}. Workspaces: {', '.join(map(str, cfg.roots))}")

    backoff = 1.0
    while not stop.is_set():
        try:
            r = client.post("/poll", json={})
            if r.status_code == 401:
                break
            task = r.json().get("task") if r.status_code == 200 else None
            backoff = 1.0
        except (httpx.HTTPError, ValueError):
            stop.wait(backoff)
            backoff = min(backoff * 2, 30)
            continue
        if not task:
            continue
        print(f"→ {task.get('tool')}")
        result = execute(task, cfg)
        try:
            client.post("/result", json={"task_id": task["id"], "result": result})
        except httpx.HTTPError:
            time.sleep(1)
    DEV.stop_all()


def main() -> None:
    if len(sys.argv) >= 3 and sys.argv[1] == "pair":
        pair(sys.argv[2])
    elif len(sys.argv) >= 2 and sys.argv[1] == "start":
        start()
    else:
        print("Usage: python -m runner pair <CODE> | python -m runner start")


if __name__ == "__main__":
    main()
