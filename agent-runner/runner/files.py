"""Workspace-confined filesystem tools."""
from __future__ import annotations

import fnmatch
import os
import shutil
import time
from pathlib import Path
from typing import Any

from .config import Config
from .security import IGNORED_DIRS, SENSITIVE_DIR, SENSITIVE_NAME, ToolError, resolve_in_root

MAX_LIST = 500


def _rel(root: Path, p: Path) -> str:
    return str(p.relative_to(root)) or "."


def _is_text(p: Path) -> bool:
    with open(p, "rb") as f:
        return b"\x00" not in f.read(4096)


def list_files(root: Path, a: dict[str, Any], _c: Config):
    base = resolve_in_root(root, a.get("path"), must_exist=True)
    depth = max(1, min(4, int(a.get("depth") or 2)))
    out: list[dict[str, Any]] = []
    for dirpath, dirnames, filenames in os.walk(base, followlinks=False):
        d = Path(dirpath)
        level = len(d.relative_to(base).parts)
        dirnames[:] = sorted(n for n in dirnames if n not in IGNORED_DIRS and n not in SENSITIVE_DIR)
        if level >= depth:
            dirnames[:] = []
        for n in dirnames:
            out.append({"path": _rel(root, d / n), "type": "dir"})
        for n in sorted(filenames):
            if SENSITIVE_NAME.search(n):
                continue
            p = d / n
            try:
                out.append({"path": _rel(root, p), "type": "file", "size": p.lstat().st_size})
            except OSError:
                continue
        if len(out) >= MAX_LIST:
            return {"entries": out[:MAX_LIST], "truncated": True}
    return {"entries": out, "truncated": False}


def read_file(root: Path, a: dict[str, Any], c: Config):
    p = resolve_in_root(root, a["path"], must_exist=True)
    if not p.is_file():
        raise ToolError("NOT_A_FILE", "That path is a folder.")
    if p.stat().st_size > 20_000_000 or not _is_text(p):
        raise ToolError("BINARY_OR_TOO_LARGE", "This file is binary or too large to read.")
    start = max(1, int(a.get("start_line") or 1))
    end = int(a.get("end_line") or start + 399)
    end = max(start, min(end, start + 1999))
    lines, total, size = [], 0, 0
    with open(p, encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f, 1):
            total = i
            if start <= i <= end and size < c.max_file_read:
                lines.append(line)
                size += len(line)
    return {"path": _rel(root, p), "start_line": start, "end_line": min(end, total), "total_lines": total,
            "content": "".join(lines), "more": end < total or size >= c.max_file_read}


def _backup(root: Path, p: Path) -> str | None:
    if not p.exists():
        return None
    dest = root / ".agent-backups" / f"{_rel(root, p).replace(os.sep, '__')}.{int(time.time())}.bak"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dest)
    return _rel(root, dest)


def write_file(root: Path, a: dict[str, Any], _c: Config):
    p = resolve_in_root(root, a["path"])
    if p.is_dir():
        raise ToolError("NOT_A_FILE", "That path is a folder.")
    content = str(a["content"])
    if len(content.encode()) > 2_000_000:
        raise ToolError("TOO_LARGE", "Content is too large.")
    backup = _backup(root, p)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return {"path": _rel(root, p), "bytes": len(content.encode()), "created": backup is None, "backup": backup}


def edit_file(root: Path, a: dict[str, Any], _c: Config):
    p = resolve_in_root(root, a["path"], must_exist=True)
    text = p.read_text(encoding="utf-8")
    old, new = str(a["old_text"]), str(a["new_text"])
    n = text.count(old)
    if n == 0:
        raise ToolError("TEXT_NOT_FOUND", "old_text was not found in the file.")
    if n > 1:
        raise ToolError("TEXT_NOT_UNIQUE", f"old_text appears {n} times; include more surrounding context.")
    backup = _backup(root, p)
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    return {"path": _rel(root, p), "replaced": 1, "backup": backup}


def delete_file(root: Path, a: dict[str, Any], _c: Config):
    p = resolve_in_root(root, a["path"], must_exist=True)
    if p == root.resolve():
        raise ToolError("FORBIDDEN", "The workspace root cannot be deleted.")
    if p.is_dir():
        if any(p.iterdir()):
            raise ToolError("DIRECTORY_NOT_EMPTY", "Only empty folders can be deleted.")
        p.rmdir()
        return {"deleted": _rel(root, p), "type": "dir"}
    backup = _backup(root, p)
    p.unlink()
    return {"deleted": _rel(root, p), "backup": backup}


def create_directory(root: Path, a: dict[str, Any], _c: Config):
    p = resolve_in_root(root, a["path"])
    p.mkdir(parents=True, exist_ok=True)
    return {"created": _rel(root, p)}


def move_file(root: Path, a: dict[str, Any], _c: Config):
    src = resolve_in_root(root, a["source_path"], must_exist=True)
    dst = resolve_in_root(root, a["destination_path"])
    backup = _backup(root, dst) if dst.is_file() else None
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    return {"from": _rel(root, src), "to": _rel(root, dst), "overwritten_backup": backup}


def search_files(root: Path, a: dict[str, Any], _c: Config):
    base = resolve_in_root(root, a.get("path"), must_exist=True)
    q = str(a["query"])
    glob = a.get("include_glob")
    hits: list[dict[str, Any]] = []
    for dirpath, dirnames, filenames in os.walk(base, followlinks=False):
        dirnames[:] = [n for n in dirnames if n not in IGNORED_DIRS and n not in SENSITIVE_DIR]
        for n in filenames:
            if SENSITIVE_NAME.search(n) or (glob and not fnmatch.fnmatch(n, glob)):
                continue
            p = Path(dirpath) / n
            try:
                if p.is_symlink() or p.stat().st_size > 1_000_000 or not _is_text(p):
                    continue
                with open(p, encoding="utf-8", errors="replace") as f:
                    for i, line in enumerate(f, 1):
                        if q in line:
                            hits.append({"path": _rel(root, p), "line": i, "text": line.strip()[:300]})
                            if len(hits) >= 200:
                                return {"matches": hits, "truncated": True}
            except OSError:
                continue
    return {"matches": hits, "truncated": False}
