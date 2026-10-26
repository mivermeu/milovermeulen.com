"""Tests for the snapshot API: caching, conditional requests, health, errors."""

from __future__ import annotations

import contextlib
import json
import threading
import urllib.error
import urllib.request
from collections.abc import Iterator
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

from ..server import SnapshotAPIHandler

SNAPSHOT = {"v": 0, "generated_at": 1792978330, "trains": [], "alerts": []}


@contextlib.contextmanager
def running_server(tmp_path: Path) -> Iterator[str]:
    (tmp_path / "snapshot.json").write_text(json.dumps(SNAPSHOT))
    handler = type("TestSnapshotHandler", (SnapshotAPIHandler,), {"www_dir": tmp_path})
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address[0], server.server_address[1]
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_serves_snapshot_with_validators(tmp_path):
    with running_server(tmp_path) as base, urllib.request.urlopen(f"{base}/snapshot.json") as resp:
        assert resp.status == 200
        assert resp.headers["Content-Type"] == "application/json"
        assert resp.headers["Cache-Control"].startswith("public, max-age=10")
        assert resp.headers["ETag"]
        assert resp.headers["Last-Modified"]
        assert resp.headers["Access-Control-Allow-Origin"] == "*"
        assert json.loads(resp.read()) == SNAPSHOT


def test_head_has_headers_and_no_body(tmp_path):
    with running_server(tmp_path) as base:
        request = urllib.request.Request(f"{base}/snapshot.json", method="HEAD")
        with urllib.request.urlopen(request) as resp:
            assert resp.status == 200
            assert int(resp.headers["Content-Length"]) > 0
            assert resp.read() == b""


def test_conditional_request_returns_304(tmp_path):
    with running_server(tmp_path) as base:
        with urllib.request.urlopen(f"{base}/snapshot.json") as resp:
            etag = resp.headers["ETag"]
        request = urllib.request.Request(f"{base}/snapshot.json", headers={"If-None-Match": etag})
        with pytest.raises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request)
        assert caught.value.code == 304


def test_health_reports_fresh_snapshot(tmp_path):
    with running_server(tmp_path) as base, urllib.request.urlopen(f"{base}/health") as resp:
        assert resp.status == 200
        body = json.loads(resp.read())
        assert body["status"] == "ok"
        assert body["snapshot_age_s"] is not None


def test_health_reports_missing_snapshot(tmp_path):
    with running_server(tmp_path) as base:
        (tmp_path / "snapshot.json").unlink()
        with pytest.raises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(f"{base}/health")
        assert caught.value.code == 503
        assert json.loads(caught.value.read())["status"] == "missing"


def test_unknown_path_is_404(tmp_path):
    with running_server(tmp_path) as base:
        with pytest.raises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(f"{base}/nope")
        assert caught.value.code == 404


def test_options_is_cors_preflight(tmp_path):
    with running_server(tmp_path) as base:
        request = urllib.request.Request(f"{base}/snapshot.json", method="OPTIONS")
        with urllib.request.urlopen(request) as resp:
            assert resp.status == 204
            assert resp.headers["Access-Control-Allow-Origin"] == "*"


def test_serves_graph_manifest_and_artifacts(tmp_path):
    (tmp_path / "graph.json").write_text(json.dumps({"hash": "abcdefabcdef"}))
    (tmp_path / "graph-abcdefabcdef.json").write_text("{}")
    (tmp_path / "shapes-abcdefabcdef.bin").write_bytes(b"\x00" * 8)

    with running_server(tmp_path) as base:
        with urllib.request.urlopen(f"{base}/graph.json") as resp:
            assert resp.status == 200
            assert resp.headers["Cache-Control"].startswith("public, max-age=10")
        with urllib.request.urlopen(f"{base}/graph-abcdefabcdef.json") as resp:
            assert resp.headers["Content-Type"] == "application/json"
            assert "immutable" in resp.headers["Cache-Control"]
        with urllib.request.urlopen(f"{base}/shapes-abcdefabcdef.bin") as resp:
            assert resp.headers["Content-Type"] == "application/octet-stream"
            assert resp.read() == b"\x00" * 8


def test_unknown_artifacts_are_rejected(tmp_path):
    with running_server(tmp_path) as base:
        for path in ("/graph-deadbeef.json", "/graph.json.bak", "/secrets"):
            with pytest.raises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(f"{base}{path}")
            assert caught.value.code == 404
