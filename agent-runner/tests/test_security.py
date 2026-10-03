import os
import tempfile
from pathlib import Path

import pytest

from runner.commands import _validate
from runner.config import Config
from runner.files import edit_file, read_file, write_file
from runner.security import ToolError, check_ip, resolve_in_root


@pytest.fixture()
def root():
    with tempfile.TemporaryDirectory() as d:
        yield Path(d).resolve()


def cfg(root):
    return Config(app_url="https://x", roots=[root])


@pytest.mark.parametrize("p", ["../x", "/etc/passwd", "~/.ssh/id_rsa", "a/../../b", "x\x00y", ".ssh/id_rsa", ".env", "conf/.env.local", "key.pem"])
def test_blocked_paths(root, p):
    with pytest.raises(ToolError):
        resolve_in_root(root, p)


def test_symlink_escape(root):
    os.symlink("/etc", root / "link")
    with pytest.raises(ToolError):
        resolve_in_root(root, "link/passwd")


def test_write_edit_read(root):
    write_file(root, {"path": "hello.txt", "content": "Hello World"}, cfg(root))
    assert read_file(root, {"path": "hello.txt"}, cfg(root))["content"] == "Hello World"
    r = edit_file(root, {"path": "hello.txt", "old_text": "World", "new_text": "Agent"}, cfg(root))
    assert r["backup"] and (root / "hello.txt").read_text() == "Hello Agent"


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.0.0.5", "169.254.169.254", "::1", "192.168.1.1", "0.0.0.0", "::ffff:127.0.0.1"])
def test_ssrf_blocked(ip):
    with pytest.raises(ToolError):
        check_ip(ip)


def test_public_ip_ok():
    check_ip("1.1.1.1")


@pytest.mark.parametrize("cmd,args", [("sudo", ["rm", "-rf", "/"]), ("rm", ["-rf", "/"]), ("bash", ["-c", "x"]), ("git", ["push"]), ("python", ["-c", "print(1)"]), ("curl", ["x"])])
def test_denied_commands(cmd, args):
    with pytest.raises(ToolError):
        _validate(cmd, args)


def test_allowed_command():
    _validate("npm", ["run", "build"])
