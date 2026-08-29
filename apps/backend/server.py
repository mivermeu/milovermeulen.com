"""
Satellite TLE API server.

Serves TLE JSON data with API key authentication.
Designed to run behind nginx reverse proxy (localhost only).
"""

from __future__ import annotations

import json
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any


def get_api_key() -> str | None:
    """Read API key from file. Returns None if not found."""
    key_file = Path(os.environ.get("SATELLITE_API_KEY_FILE", ""))
    if not key_file:
        key_file = Path.home() / ".config" / "satellite-api" / "key"
    if key_file.is_file():
        return key_file.read_text().strip()
    return None


class SatelliteAPIHandler(SimpleHTTPRequestHandler):
    """HTTP handler that serves TLE JSON with API key auth."""

    api_key: str | None = get_api_key()
    data_dir: Path = Path(os.environ.get("SATELLITE_DATA_DIR", "/var/www/satellite-api"))

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {"status": "ok"})
            return

        if self.api_key:
            provided = self.headers.get("X-API-Key", "")
            if provided != self.api_key:
                self._send_json(
                    403,
                    {"error": "Forbidden", "message": "Valid X-API-Key header required"},
                )
                return

        # Resolve and validate path — prevent traversal outside data_dir
        rel = self.path.lstrip("/")
        file_path = (self.data_dir / rel).resolve()
        if not str(file_path).startswith(str(self.data_dir.resolve())):
            self._send_json(403, {"error": "Forbidden", "message": "Path not allowed"})
            return

        if not file_path.exists() or not file_path.is_file():
            self._send_json(404, {"error": "Not Found"})
            return

        content_type = (
            "application/json" if self.path.endswith(".json") else "application/octet-stream"
        )
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, code: int, body: dict[str, Any]) -> None:
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:
        pass  # Quiet logging; nginx handles access logs


def main() -> None:
    host = os.environ.get("SATELLITE_API_HOST", "127.0.0.1")
    port = int(os.environ.get("SATELLITE_API_PORT", "8081"))

    if not get_api_key():
        print("Warning: No API key file found", file=sys.stderr)

    server = HTTPServer((host, port), SatelliteAPIHandler)
    print(f"Satellite API listening on {host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
