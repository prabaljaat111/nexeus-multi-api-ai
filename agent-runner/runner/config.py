"""Runner configuration from environment variables (never from the app or the model)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

STATE_DIR = Path(os.environ.get("AGENT_RUNNER_STATE_DIR", Path.home() / ".agent-runner"))
TOKEN_FILE = STATE_DIR / "credentials.json"


def _int(name: str, default: int, lo: int, hi: int) -> int:
    try:
        v = int(os.environ.get(name, default))
    except ValueError:
        v = default
    return max(lo, min(hi, v))


@dataclass(frozen=True)
class Config:
    app_url: str
    roots: list[Path] = field(default_factory=list)
    max_tool_seconds: int = 120
    max_command_output: int = 200_000
    max_fetch_bytes: int = 3_000_000
    max_fetch_redirects: int = 5
    max_file_read: int = 400_000
    max_dev_servers: int = 2
    allow_network_commands: bool = False


def load() -> Config:
    app = os.environ.get("APP_URL", "").rstrip("/")
    if not app.startswith("https://") and not app.startswith("http://localhost"):
        raise SystemExit("APP_URL must be the https:// address of your app.")
    raw = os.environ.get("APPROVED_WORKSPACE_ROOTS", str(Path.home() / "AI-Projects"))
    roots: list[Path] = []
    for part in raw.split(os.pathsep if os.pathsep in raw else ","):
        part = part.strip()
        if not part:
            continue
        p = Path(part).expanduser().resolve()
        p.mkdir(parents=True, exist_ok=True)
        from .security import is_forbidden_root
        if is_forbidden_root(p):
            raise SystemExit(f"Refusing unsafe workspace root: {p}")
        roots.append(p)
    if not roots:
        raise SystemExit("Set APPROVED_WORKSPACE_ROOTS to at least one folder.")
    return Config(
        app_url=app,
        roots=roots,
        max_tool_seconds=_int("MAX_TOOL_EXECUTION_SECONDS", 120, 5, 600),
        max_command_output=_int("MAX_COMMAND_OUTPUT_BYTES", 200_000, 10_000, 2_000_000),
        max_fetch_bytes=_int("MAX_WEB_FETCH_BYTES", 3_000_000, 50_000, 10_000_000),
        max_fetch_redirects=_int("MAX_WEB_FETCH_REDIRECTS", 5, 0, 10),
        max_file_read=_int("MAX_FILE_READ_BYTES", 400_000, 10_000, 5_000_000),
        max_dev_servers=_int("MAX_RUNNING_DEV_SERVERS_PER_WORKSPACE", 2, 1, 5),
    )
