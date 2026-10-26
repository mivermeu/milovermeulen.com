"""
Satellite TLE API server.

Serves TLE JSON data. Designed to run behind nginx reverse proxy (localhost only).
"""

from __future__ import annotations

import email.utils
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any

# The TLE catalog is a few MB and only changes when the fetch timer runs (every
# few hours), so let browsers reuse it for a while and revalidate cheaply via the
# ETag / Last-Modified validators once the window passes.
CACHE_MAX_AGE_S = int(os.environ.get("SATELLITE_CACHE_MAX_AGE", "1800"))


class SatelliteAPIHandler(SimpleHTTPRequestHandler):
    """HTTP handler that serves TLE JSON."""

    data_dir: Path = Path(os.environ.get("SATELLITE_DATA_DIR", "/var/www/satellite-api"))

    def _send_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self) -> None:
        self._handle(send_body=True)

    def do_HEAD(self) -> None:
        self._handle(send_body=False)

    def _handle(self, send_body: bool) -> None:
        if self.path == "/health":
            self._send_json(200, {"status": "ok"}, send_body=send_body)
            return

        # Resolve and validate path — prevent traversal outside data_dir
        rel = self.path.lstrip("/")
        file_path = (self.data_dir / rel).resolve()
        if not str(file_path).startswith(str(self.data_dir.resolve())):
            self._send_json(403, {"error": "Forbidden", "message": "Path not allowed"}, send_body)
            return

        if not file_path.exists() or not file_path.is_file():
            self._send_json(404, {"error": "Not Found"}, send_body)
            return

        self._serve_file(file_path, send_body)

    def _serve_file(self, file_path: Path, send_body: bool) -> None:
        stat = file_path.stat()
        etag = f'"{int(stat.st_mtime)}-{stat.st_size}"'
        last_modified = self.date_time_string(stat.st_mtime)
        cache_control = f"public, max-age={CACHE_MAX_AGE_S}"

        if self._not_modified(etag, stat.st_mtime):
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", cache_control)
            self._send_cors()
            self.end_headers()
            return

        content_type = (
            "application/json" if file_path.name.endswith(".json") else "application/octet-stream"
        )
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", last_modified)
        self.send_header("Cache-Control", cache_control)
        self._send_cors()
        self.end_headers()
        if send_body:
            self.wfile.write(data)

    def _not_modified(self, etag: str, mtime: float) -> bool:
        if_none_match = self.headers.get("If-None-Match")
        if if_none_match:
            tags = [self._strip_weakness(tag) for tag in if_none_match.split(",")]
            return "*" in tags or etag in tags
        if_modified_since = self.headers.get("If-Modified-Since")
        if if_modified_since:
            try:
                since = email.utils.parsedate_to_datetime(if_modified_since).timestamp()
            except (TypeError, ValueError):
                return False
            return int(mtime) <= since
        return False

    @staticmethod
    def _strip_weakness(tag: str) -> str:
        """Drop an ETag's weakness marker ('W/"x"' -> '"x"').

        If-None-Match uses the weak comparison (RFC 9110), and nginx marks the
        ETag weak whenever it gzips the response. Browsers echo that validator
        back verbatim, so the marker has to be ignored for the match to succeed.
        """
        tag = tag.strip()
        return tag[2:] if tag[:2].lower() == "w/" else tag

    def _send_json(self, code: int, payload: dict[str, Any], send_body: bool = True) -> None:
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self._send_cors()
        self.end_headers()
        if send_body:
            self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:
        pass  # Quiet logging; nginx handles access logs


def main() -> None:
    host = os.environ.get("SATELLITE_API_HOST", "127.0.0.1")
    port = int(os.environ.get("SATELLITE_API_PORT", "8081"))

    server = HTTPServer((host, port), SatelliteAPIHandler)
    print(f"Satellite API listening on {host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
