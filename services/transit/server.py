"""Snapshot and graph API for the transit frontend.

Serves the JSON the poller and graph builder write. Stays deliberately dumb: no
merging, no database, no auth — files are read per request, so a poller crash
degrades to a stale snapshot instead of an outage. Runs on localhost behind
nginx, which also gzips it.
"""

from __future__ import annotations

import contextlib
import email.utils
import json
import logging
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

log = logging.getLogger("transit.api")

CACHE_CONTROL = "public, max-age=10, stale-while-revalidate=20"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
STALE_AFTER_S = int(os.environ.get("TRANSIT_STALE_AFTER", "120"))

# Content-addressed artifacts only. Anything else in the directory stays private,
# and the pattern is also what keeps path traversal out.
_STATIC_NAME = re.compile(
    r"^(graph\.json|audit\.json|graph-[0-9a-f]{12}\.json|shapes-[0-9a-f]{12}\.bin)$"
)


class SnapshotAPIHandler(BaseHTTPRequestHandler):
    www_dir: Path = Path(os.environ.get("TRANSIT_WWW_DIR", "/var/www/transit-api"))
    snapshot_name = "snapshot.json"

    def do_GET(self) -> None:
        self._handle(send_body=True)

    def do_HEAD(self) -> None:
        self._handle(send_body=False)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _handle(self, send_body: bool) -> None:
        path = self.path.split("?", 1)[0]
        if path in ("/health", "/healthz"):
            self._health(send_body)
            return
        name = self.snapshot_name if path == "/" else path.lstrip("/")
        if name == self.snapshot_name:
            self._serve_file(name, send_body, CACHE_CONTROL, missing_status=503)
        elif _STATIC_NAME.match(name):
            cache = IMMUTABLE_CACHE if "-" in name else CACHE_CONTROL
            self._serve_file(name, send_body, cache, missing_status=404)
        else:
            self._json(404, {"error": "not found"}, send_body)

    def _serve_file(
        self, name: str, send_body: bool, cache_control: str, missing_status: int
    ) -> None:
        path = self.www_dir / name
        try:
            # Read from one open handle and fstat it, so ETag/Last-Modified cannot
            # describe a different inode than the bytes (the writers rename files
            # underneath us).
            with path.open("rb") as handle:
                stat = os.fstat(handle.fileno())
                payload = handle.read()
        except OSError:
            self._json(missing_status, {"error": f"{name} unavailable"}, send_body)
            return

        content_type = "application/json" if name.endswith(".json") else "application/octet-stream"
        etag = f'"{stat.st_mtime_ns}-{len(payload)}"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", cache_control)
            self._cors()
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", cache_control)
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", email.utils.formatdate(stat.st_mtime, usegmt=True))
        self._cors()
        self.end_headers()
        if send_body:
            self.wfile.write(payload)

    def _health(self, send_body: bool) -> None:
        path = self.www_dir / self.snapshot_name
        try:
            age: int | None = int(time.time() - path.stat().st_mtime)
        except OSError:
            age = None
        if age is None:
            status, body = 503, {"status": "missing", "snapshot_age_s": None}
        elif age > STALE_AFTER_S:
            status, body = 503, {"status": "stale", "snapshot_age_s": age}
        else:
            status, body = 200, {"status": "ok", "snapshot_age_s": age}
        self._json(status, body, send_body)

    def _json(self, status: int, body: dict[str, Any], send_body: bool) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        if send_body:
            self.wfile.write(payload)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "If-None-Match")

    def log_message(self, fmt: str, *args: object) -> None:
        log.debug("%s %s", self.address_string(), fmt % args)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    host = os.environ.get("TRANSIT_API_HOST", "127.0.0.1")
    port = int(os.environ.get("TRANSIT_API_PORT", "8082"))
    server = ThreadingHTTPServer((host, port), SnapshotAPIHandler)
    log.info("transit api listening on http://%s:%d", host, port)
    try:
        with contextlib.suppress(KeyboardInterrupt):
            server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
