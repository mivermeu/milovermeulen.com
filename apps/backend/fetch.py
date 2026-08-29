"""
Satellite TLE data fetcher.

Fetches TLE data from space-track.org (with auth) or CelesTrak (public fallback).
Implements incremental updates per Space-Track best practices:
  - Use EPOCH/>now-1 to only fetch recently updated TLEs
  - Merge with existing data to avoid re-downloading the full catalog
"""

import json
import ssl
import time
import urllib.request
import urllib.parse
import http.cookiejar
from pathlib import Path


def parse_tle_text(text: str) -> list[dict]:
    """Parse TLE text into a list of {name, line1, line2} dicts.

    TLE format has 3 lines per satellite: name, line1 (starts with '1 '), line2 (starts with '2 ').
    """
    lines = text.splitlines()
    satellites = []
    i = 0
    while i < len(lines):
        line1 = lines[i].rstrip()
        if not line1.startswith("1 "):
            i += 1
            continue
        line2 = lines[i + 1].rstrip() if i + 1 < len(lines) else ""
        if not line2.startswith("2 "):
            i += 1
            continue
        name = ""
        for j in range(i - 1, -1, -1):
            candidate = lines[j].strip()
            if candidate and not candidate.startswith("1 ") and not candidate.startswith("2 "):
                name = candidate
                break
        satellites.append({"name": name, "line1": line1, "line2": line2})
        i += 2
    return satellites


def merge_tles(existing: dict[str, dict], new: list[dict]) -> dict[str, dict]:
    """Merge new TLEs into existing dict (keyed by name). New entries overwrite existing."""
    merged = dict(existing)
    for tle in new:
        merged[tle["name"]] = tle
    return merged


def make_spacetrack_opener(username: str, password: str, auth_url: str, timeout: int = 30):
    """Authenticate with Space-Track and return an authenticated opener.

    Returns (opener, success_bool).
    """
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

    auth_data = urllib.parse.urlencode({
        "identity": username,
        "password": password,
    }).encode("utf-8")
    auth_req = urllib.request.Request(auth_url, data=auth_data, method="POST")
    auth_req.add_header("User-Agent", "satellite-api/1.0")
    try:
        with opener.open(auth_req, timeout=timeout) as resp:
            if resp.status != 200:
                return opener, False
    except Exception:
        return opener, False
    return opener, True


def fetch_gp_json(opener, url: str, timeout: int = 60) -> list[dict] | None:
    """Fetch GP data from space-track and extract deduplicated TLEs.

    Returns list of {name, line1, line2} or None on failure.
    """
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "satellite-api/1.0")
    try:
        with opener.open(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        return None

    objects: dict[str, dict] = {}
    for rec in data:
        name = rec.get("OBJECT_NAME", "")
        epoch = rec.get("EPOCH", "")
        tle1 = rec.get("TLE_LINE1", "")
        tle2 = rec.get("TLE_LINE2", "")
        if not (name and tle1 and tle2):
            continue
        if name not in objects or epoch > objects[name]["epoch"]:
            objects[name] = {
                "name": name,
                "line1": tle1.strip(),
                "line2": tle2.strip(),
                "epoch": epoch,
            }

    return [{"name": o["name"], "line1": o["line1"], "line2": o["line2"]} for o in objects.values()]


def _relaxed_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_celestrak(url: str, timeout: int = 30) -> list[dict] | None:
    """Fetch TLE data from CelesTrak (public, no auth).

    Tries strict SSL first, then relaxed (CelesTrak has expired cert).
    Returns list of {name, line1, line2} or None.
    """
    for attempt, ctx in enumerate([None, _relaxed_ssl_context()]):
        req = urllib.request.Request(url, headers={"User-Agent": "satellite-api/1.0"})
        try:
            if ctx is not None:
                resp = urllib.request.urlopen(req, timeout=timeout, context=ctx)
            else:
                resp = urllib.request.urlopen(req, timeout=timeout)
            with resp:
                data = resp.read().decode("utf-8")
                if data.strip() and "403" not in data[:200]:
                    return parse_tle_text(data)
        except Exception:
            continue
    return None


def load_existing(tle_path: Path) -> dict[str, dict]:
    """Load existing TLE data from disk, indexed by OBJECT_NAME."""
    if not tle_path.exists():
        return {}
    try:
        data = json.loads(tle_path.read_text())
        return {s["name"]: s for s in data if "name" in s}
    except Exception:
        return {}


def save_json(satellites: list[dict], tle_path: Path) -> None:
    """Atomically write satellite data as JSON."""
    tle_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = tle_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(satellites, indent=None))
    tmp.rename(tle_path)
