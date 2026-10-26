"""Tests for the TLE API server."""

from __future__ import annotations

import contextlib
import http.client
import json
import tempfile
import threading
import urllib.error
import urllib.request
from collections.abc import Iterator
from http.server import HTTPServer
from pathlib import Path

from ..server import SatelliteAPIHandler

TLES = [{"name": "ISS (ZARYA)", "line1": "1 25544U", "line2": "2 25544"}]


@contextlib.contextmanager
def running_server() -> Iterator[tuple[str, int]]:
    with tempfile.TemporaryDirectory() as tmpdir:
        data_dir = Path(tmpdir)
        (data_dir / "tles.json").write_text(json.dumps(TLES))
        handler = type("TestHandler", (SatelliteAPIHandler,), {"data_dir": data_dir})
        httpd = HTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{httpd.server_address[1]}", httpd.server_address[1]
        finally:
            httpd.shutdown()
            httpd.server_close()


def request(url: str, method: str = "GET", headers: dict[str, str] | None = None):
    req = urllib.request.Request(url, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, resp.headers, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers, exc.read()


def test_serves_json_with_validators() -> None:
    with running_server() as (url, _):
        status, headers, body = request(f"{url}/tles.json")
        assert status == 200
        assert headers["Content-Type"] == "application/json"
        assert headers["ETag"]
        assert headers["Last-Modified"]
        assert headers["Cache-Control"].startswith("public, max-age=")
        assert json.loads(body) == TLES


def test_head_returns_headers_without_body() -> None:
    with running_server() as (url, _):
        status, headers, body = request(f"{url}/tles.json", method="HEAD")
        assert status == 200
        assert body == b""
        assert int(headers["Content-Length"]) > 0
        assert headers["ETag"]


def test_if_none_match_returns_304() -> None:
    with running_server() as (url, _):
        _, headers, _ = request(f"{url}/tles.json")
        status, headers2, body = request(
            f"{url}/tles.json", headers={"If-None-Match": headers["ETag"]}
        )
        assert status == 304
        assert body == b""
        assert headers2["ETag"] == headers["ETag"]


def test_weak_if_none_match_returns_304() -> None:
    """nginx marks the ETag weak when it gzips; browsers echo it verbatim."""
    with running_server() as (url, _):
        _, headers, _ = request(f"{url}/tles.json")
        peer_etag = f"W/{headers['ETag']}"
        status, _, body = request(f"{url}/tles.json", headers={"If-None-Match": peer_etag})
        assert status == 304
        assert body == b""


def test_if_none_match_list_returns_304() -> None:
    with running_server() as (url, _):
        _, headers, _ = request(f"{url}/tles.json")
        peer_etag = f'"some-other-version", W/{headers["ETag"]}'
        status, _, _ = request(f"{url}/tles.json", headers={"If-None-Match": peer_etag})
        assert status == 304


def test_if_modified_since_returns_304() -> None:
    with running_server() as (url, _):
        _, headers, _ = request(f"{url}/tles.json")
        status, _, _ = request(
            f"{url}/tles.json", headers={"If-Modified-Since": headers["Last-Modified"]}
        )
        assert status == 304


def test_missing_file_is_404() -> None:
    with running_server() as (url, _):
        status, _, _ = request(f"{url}/nope.json")
        assert status == 404


def test_path_traversal_is_forbidden() -> None:
    with running_server() as (_, port):
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        try:
            conn.request("GET", "/../secret.json")
            resp = conn.getresponse()
            resp.read()
        finally:
            conn.close()
        assert resp.status == 403


def test_health() -> None:
    with running_server() as (url, _):
        status, _, body = request(f"{url}/health")
        assert status == 200
        assert json.loads(body) == {"status": "ok"}
