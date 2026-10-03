"""Workspace path confinement, sensitive-file rules and SSRF address checks."""
from __future__ import annotations

import ipaddress
import os
import re
import stat
from pathlib import Path


class ToolError(Exception):
    def __init__(self, type_: str, message: str):
        super().__init__(message)
        self.type = type_
        self.message = message


_FORBIDDEN_ROOTS = [Path(p) for p in ("/", "/etc", "/bin", "/sbin", "/usr", "/var", "/boot", "/dev", "/proc", "/sys", "/root", "/lib", "/opt", "/System", "/Library", "C:\\Windows")]

SENSITIVE_NAME = re.compile(
    r"(^\.env($|\.)|^id_(rsa|dsa|ecdsa|ed25519)|\.(pem|key|p12|pfx|keystore|jks|kdbx|gpg)$|^credentials(\.json)?$|^\.netrc$|^\.npmrc$|^\.pypirc$|"
    r"^\.git-credentials$|^secrets?\.(json|ya?ml|toml)$|^service[-_]account.*\.json$)",
    re.I,
)
SENSITIVE_DIR = {".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker", ".config", "Cookies", "Login Data", ".mozilla", "Google", "BraveSoftware", "Keychains"}
IGNORED_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".cache", ".agent-backups"}


def is_forbidden_root(p: Path) -> bool:
    home = Path.home().resolve()
    if p == home:
        return True
    return any(p == r for r in _FORBIDDEN_ROOTS) or any(part in SENSITIVE_DIR for part in p.parts)


def resolve_in_root(root: Path, rel: str | None, *, must_exist: bool = False, allow_sensitive: bool = False) -> Path:
    """Resolve a model-supplied relative path and guarantee it stays inside root (symlinks included)."""
    rel = (rel or ".").strip()
    if "\x00" in rel:
        raise ToolError("INVALID_PATH", "Path contains a null byte.")
    if len(rel) > 1000:
        raise ToolError("INVALID_PATH", "Path is too long.")
    if rel.startswith("~") or os.path.isabs(rel) or re.match(r"^[A-Za-z]:[\\/]", rel):
        raise ToolError("PATH_OUTSIDE_WORKSPACE", "Use a path relative to the selected workspace.")
    root = root.resolve()
    candidate = (root / rel).resolve()  # resolves symlinks and ..
    if candidate != root and root not in candidate.parents:
        raise ToolError("PATH_OUTSIDE_WORKSPACE", "That path is outside the selected workspace.")
    parts = candidate.relative_to(root).parts
    if not allow_sensitive:
        if any(p in SENSITIVE_DIR for p in parts) or (parts and SENSITIVE_NAME.search(parts[-1])):
            raise ToolError("SENSITIVE_PATH", "Access to secret or credential files is blocked.")
    if candidate.exists():
        st = os.lstat(candidate)
        if not (stat.S_ISREG(st.st_mode) or stat.S_ISDIR(st.st_mode)):
            raise ToolError("INVALID_PATH", "Only regular files and folders are allowed.")
    elif must_exist:
        raise ToolError("FILE_NOT_FOUND", "The requested file does not exist in the selected workspace.")
    return candidate


def check_ip(ip: str) -> None:
    addr = ipaddress.ip_address(ip)
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    if (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_reserved
            or addr.is_unspecified or not addr.is_global or str(addr).startswith("169.254.")):
        raise ToolError("BLOCKED_DESTINATION", "That address is on a private or internal network and cannot be fetched.")
