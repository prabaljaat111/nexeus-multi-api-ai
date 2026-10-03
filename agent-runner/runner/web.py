"""web_search (DuckDuckGo via `ddgs`) and SSRF-safe web_fetch."""
from __future__ import annotations

import socket
from abc import ABC, abstractmethod
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from .config import Config
from .security import ToolError, check_ip


class SearchProvider(ABC):
    @abstractmethod
    def search(self, query: str, max_results: int, region: str, safesearch: str, timelimit: str | None) -> list[dict[str, str]]: ...


class DuckDuckGoProvider(SearchProvider):
    def search(self, query, max_results, region, safesearch, timelimit):
        from ddgs import DDGS  # maintained successor of duckduckgo_search
        try:
            rows = DDGS().text(query, region=region, safesearch=safesearch, timelimit=timelimit, max_results=max_results) or []
        except Exception as e:  # noqa: BLE001 — provider errors become structured errors
            raise ToolError("SEARCH_FAILED", f"Search failed: {type(e).__name__}") from None
        out = []
        for r in rows:
            url = r.get("href") or r.get("url") or ""
            if not url.startswith(("http://", "https://")):
                continue
            out.append({"title": (r.get("title") or "")[:300], "url": url[:2000], "snippet": (r.get("body") or "")[:600], "source": urlparse(url).hostname or ""})
        return out[:max_results]


PROVIDER: SearchProvider = DuckDuckGoProvider()


def web_search(args: dict[str, Any], _cfg: Config) -> list[dict[str, str]]:
    n = max(1, min(10, int(args.get("max_results") or 5)))
    safe = args.get("safesearch") or "moderate"
    return PROVIDER.search(str(args["query"])[:400], n, str(args.get("region") or "wt-wt"), safe, args.get("time_range"))


ALLOWED_TYPES = ("text/html", "text/plain", "application/json", "text/markdown", "application/xhtml+xml")


def _validate_url(url: str) -> str:
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise ToolError("INVALID_URL", "Only public http(s) URLs can be fetched.")
    if u.username or u.password:
        raise ToolError("INVALID_URL", "URLs with credentials are not allowed.")
    host = u.hostname
    if host in ("localhost", "metadata.google.internal") or host.endswith((".local", ".internal", ".localhost")):
        raise ToolError("BLOCKED_DESTINATION", "Local and internal hosts cannot be fetched.")
    try:
        infos = socket.getaddrinfo(host, u.port or (443 if u.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise ToolError("DNS_FAILED", "The host name could not be resolved.") from None
    for info in infos:
        check_ip(info[4][0])
    return url


def web_fetch(args: dict[str, Any], cfg: Config) -> dict[str, Any]:
    url = str(args["url"])
    with httpx.Client(follow_redirects=False, timeout=httpx.Timeout(15.0, connect=8.0), headers={"user-agent": "AgentRunner/1.0 (+readable fetch)"}, trust_env=False) as client:
        for _ in range(cfg.max_fetch_redirects + 1):
            _validate_url(url)
            with client.stream("GET", url) as r:
                if r.is_redirect:
                    loc = r.headers.get("location")
                    if not loc:
                        raise ToolError("BAD_REDIRECT", "Redirect without a location.")
                    url = urljoin(url, loc)
                    continue
                ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
                if ctype and not ctype.startswith(ALLOWED_TYPES):
                    raise ToolError("UNSUPPORTED_CONTENT", f"Content type {ctype} is not supported.")
                buf = bytearray()
                for chunk in r.iter_bytes():
                    buf.extend(chunk)
                    if len(buf) > cfg.max_fetch_bytes:
                        break
                text = buf[: cfg.max_fetch_bytes].decode(r.encoding or "utf-8", errors="replace")
                status = r.status_code
            title, content = _extract(text, ctype, url)
            return {"url": url, "title": title, "content": content[:60_000], "status": status, "truncated": len(buf) > cfg.max_fetch_bytes}
    raise ToolError("TOO_MANY_REDIRECTS", "Too many redirects.")


def _extract(text: str, ctype: str, url: str) -> tuple[str, str]:
    if ctype in ("text/plain", "application/json", "text/markdown"):
        return "", text
    import trafilatura
    content = trafilatura.extract(text, url=url, include_comments=False, include_tables=True, favor_precision=True) or ""
    meta = trafilatura.extract_metadata(text)
    return ((meta.title if meta and meta.title else "") or "")[:300], content
