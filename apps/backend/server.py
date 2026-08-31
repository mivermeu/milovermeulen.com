"""
Satellite TLE API server.

Serves TLE JSON data. Designed to run behind nginx reverse proxy (localhost only).
"""

from __future__ import annotations

import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any


class SatelliteAPIHandler(SimpleHTTPRequestHandler):
    """HTTP handler that serves TLE JSON."""

    data_dir: Path = Path(os.environ.get("SATELLITE_DATA_DIR", "/var/www/satellite-api"))

    def _send_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {"status": "ok"})
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
        self._send_cors()
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, code: int, body: dict[str, Any]) -> None:
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self._send_cors()
        self.end_headers()
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
