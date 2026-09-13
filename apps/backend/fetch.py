"""
Satellite TLE data fetcher.

Fetches TLE data from space-track.org (with auth) or CelesTrak (public fallback).
Implements incremental updates per Space-Track best practices:
  - Use EPOCH/>now-1 to only fetch recently updated TLEs
  - Merge with existing data to avoid re-downloading the full catalog
"""

from __future__ import annotations

import http.cookiejar
import json
import ssl
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, TypedDict


class TleRecord(TypedDict):
    name: str
    line1: str
    line2: str


class SpacetrackRecord(TleRecord, total=False):
    epoch: str


def parse_tle_text(text: str) -> list[TleRecord]:
    """Parse TLE text into a list of TLE records.

    TLE format has 3 lines per satellite: name, line1 (starts with '1 '), line2 (starts with '2 ').
    """
    lines = text.splitlines()
    satellites: list[TleRecord] = []
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


def merge_tles(existing: dict[str, TleRecord], new: list[TleRecord]) -> dict[str, TleRecord]:
    """Merge new TLEs into existing dict (keyed by name). New entries overwrite existing."""
    merged = dict(existing)
    for tle in new:
        merged[tle["name"]] = tle
    return merged


def make_spacetrack_opener(
    username: str, password: str, auth_url: str, timeout: int = 30
) -> tuple[urllib.request.OpenerDirector, bool]:
    """Authenticate with Space-Track and return an authenticated opener.

    Returns (opener, success_bool).
    """
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

    auth_data = urllib.parse.urlencode(
        {
            "identity": username,
            "password": password,
        }
    ).encode("utf-8")
    auth_req = urllib.request.Request(auth_url, data=auth_data, method="POST")  # type: ignore[call-arg]
    auth_req.add_header("User-Agent", "satellite-api/1.0")
    try:
        with opener.open(auth_req, timeout=timeout) as resp:  # type: ignore[union-attr]
            if resp.status != 200:  # type: ignore[union-attr]
                return opener, False
    except Exception:
        return opener, False
    return opener, True


def fetch_json(opener: urllib.request.OpenerDirector, url: str, timeout: int = 60) -> Any | None:
    """GET JSON, or None on any failure (network, HTTP, decode)."""
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "satellite-api/1.0")
    try:
        with opener.open(req, timeout=timeout) as resp:  # type: ignore[union-attr]
            return json.loads(resp.read().decode())
    except Exception:
        return None


def fetch_gp_json(
    opener: urllib.request.OpenerDirector, url: str, timeout: int = 60
) -> list[TleRecord] | None:
    """Fetch GP data from space-track and extract deduplicated TLEs.

    Returns list of TleRecord or None on failure.
    """
    data = fetch_json(opener, url, timeout)
    if not isinstance(data, list):
        return None

    objects: dict[str, SpacetrackRecord] = {}
    for rec in data:
        name = rec.get("OBJECT_NAME", "")
        epoch = rec.get("EPOCH", "")
        tle1 = rec.get("TLE_LINE1", "")
        tle2 = rec.get("TLE_LINE2", "")
        if not (name and tle1 and tle2):
            continue
        if name not in objects or epoch > objects[name].get("epoch", ""):
            objects[name] = {
                "name": name,
                "line1": tle1.strip(),
                "line2": tle2.strip(),
                "epoch": epoch,
            }

    return [{"name": o["name"], "line1": o["line1"], "line2": o["line2"]} for o in objects.values()]


def _relaxed_ssl_context() -> ssl.SSLContext:
    # CelesTrak's TLS certificate has historically expired periodically.
    # This fallback avoids blocked fetches during those windows.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_celestrak(url: str, timeout: int = 30) -> list[TleRecord] | None:
    """Fetch TLE data from CelesTrak (public, no auth).

    Tries strict SSL first, then relaxed (CelesTrak has expired cert).
    Returns list of TleRecord or None.
    """
    for _attempt, ctx in enumerate([None, _relaxed_ssl_context()]):
        req = urllib.request.Request(url, headers={"User-Agent": "satellite-api/1.0"})
        try:
            if ctx is not None:
                resp = urllib.request.urlopen(req, timeout=timeout, context=ctx)  # type: ignore[arg-type]
            else:
                resp = urllib.request.urlopen(req, timeout=timeout)
            with resp:
                data = resp.read().decode("utf-8")
                if data.strip() and "403" not in data[:200]:
                    return parse_tle_text(data)
        except Exception:
            continue
    return None


def load_existing(tle_path: Path) -> dict[str, TleRecord]:
    """Load existing TLE data from disk, indexed by OBJECT_NAME."""
    if not tle_path.exists():
        return {}
    try:
        raw: list[dict[str, str]] = json.loads(tle_path.read_text())
        return {
            s["name"]: TleRecord(name=s["name"], line1=s["line1"], line2=s["line2"])
            for s in raw
            if "name" in s
        }
    except Exception:
        return {}


def save_json(satellites: list[TleRecord], tle_path: Path) -> None:
    """Atomically write satellite data as JSON."""
    tle_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = tle_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(satellites, indent=None))
    tmp.rename(tle_path)


SPACETRACK_AUTH_URL = "https://www.space-track.org/ajaxauth/login"
SPACETRACK_GP_URL = (
    "https://www.space-track.org/basicspacedata/query/class/gp"
    "/EPOCH/%3Enow-1/decay_date/null-val/orderby/OBJECT_NAME/format/json"
)
SPACETRACK_DECAY_FULL_URL = "https://www.space-track.org/basicspacedata/query/class/decay/format/json"
SPACETRACK_DECAY_RECENT_URL = (
    "https://www.space-track.org/basicspacedata/query/class/decay/MSG_EPOCH/%3Enow-1/format/json"
)
CELESTRAK_URL = "https://www.celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
TLE_PATH = Path("/var/www/satellite-api/tles.json")
DECAY_IDS_PATH = Path("/var/www/satellite-api/decayed-ids.json")
# Space-Track allows the decay class once per day; skip the refresh when the
# stored set is newer than this (the GP fetch itself may run hourly).
DECAY_REFRESH_INTERVAL_S = 20 * 3600
CREDS_PATH = Path.home() / ".config" / "satellite-api" / "spacetrack-creds"


# Alpha-5: catalog numbers >= 100000 encode the leading digits as a letter
# (A=10 .. Z=33, skipping I and O) in TLE line 1. Needed to match decay IDs.
_ALPHA5_OFFSETS = {c: n for n, c in enumerate("ABCDEFGHJKLMNPQRSTUVWXYZ", start=10)}


def norad_id(line1: str) -> str | None:
    """Catalog number from TLE line 1 (cols 3-7), or None if unparsable."""
    if not isinstance(line1, str):
        return None
    raw = line1[2:7].strip()
    if not raw:
        return None
    try:
        if raw[0].isalpha():
            return str(_ALPHA5_OFFSETS[raw[0].upper()] * 10000 + int(raw[1:]))
        return str(int(raw))
    except (ValueError, KeyError):
        return None


def parse_decay_ids(records: list[dict[str, Any]]) -> set[str]:
    """NORAD IDs from decay-class records."""
    ids: set[str] = set()
    for rec in records:
        try:
            ids.add(str(int(rec["NORAD_CAT_ID"])))  # type: ignore[arg-type]
        except (KeyError, TypeError, ValueError):
            continue
    return ids


def fetch_decay_ids(opener: urllib.request.OpenerDirector, url: str) -> set[str] | None:
    """Fetch decayed NORAD IDs. None on failure (caller keeps old data)."""
    data = fetch_json(opener, url)
    if data is None:
        return None
    try:
        return parse_decay_ids(data)
    except Exception:
        return None


def load_decay_ids(ids_path: Path) -> set[str]:
    """Load stored decayed IDs; empty set when missing or corrupt."""
    try:
        raw = json.loads(ids_path.read_text())
        return {str(int(v)) for v in raw}
    except Exception:
        return set()


def save_decay_ids(ids_path: Path, ids: set[str]) -> None:
    """Atomically write decayed IDs as JSON."""
    ids_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = ids_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(sorted(ids)))
    tmp.rename(ids_path)


def refresh_decay_ids(
    opener: urllib.request.OpenerDirector,
    ids_path: Path,
    fetch: Callable[[urllib.request.OpenerDirector, str], set[str] | None] | None = None,
) -> set[str]:
    """Union stored decay IDs with a fresh pull.

    Full history on first run (bootstrap), last-day messages after — per
    Space-Track guidance to store decay history locally, not re-download.
    Skips the pull when the stored set is newer than DECAY_REFRESH_INTERVAL_S
    (the decay class allows one query per day; the GP fetch may run hourly).
    Never raises; auxiliary state must not break the TLE update.
    """
    known = load_decay_ids(ids_path)
    if ids_path.exists():
        try:
            age_s = datetime.now(timezone.utc).timestamp() - ids_path.stat().st_mtime
        except OSError:
            age_s = float("inf")
        if age_s < DECAY_REFRESH_INTERVAL_S:
            return known
    url = SPACETRACK_DECAY_RECENT_URL if known else SPACETRACK_DECAY_FULL_URL
    fresh = (fetch or fetch_decay_ids)(opener, url)
    if fresh is None:
        return known
    known |= fresh
    try:
        save_decay_ids(ids_path, known)
    except Exception:
        pass
    return known


def drop_decayed(merged: dict[str, TleRecord], decayed_ids: set[str]) -> tuple[dict[str, TleRecord], int]:
    """Remove merged records whose NORAD ID decayed. Unparsable IDs are kept."""
    kept = {
        name: tle
        for name, tle in merged.items()
        if (cat_id := norad_id(tle["line1"])) is None or cat_id not in decayed_ids
    }
    return kept, len(merged) - len(kept)


def main() -> None:
    existing = load_existing(TLE_PATH)
    new: list[TleRecord] | None = None
    source = "none"

    try:
        username, _, password = CREDS_PATH.read_text().strip().partition(":")
    except Exception:
        username, password = "", ""
    decayed_ids: set[str] = set()
    if username and password:
        opener, ok = make_spacetrack_opener(username, password, SPACETRACK_AUTH_URL)
        if ok:
            new = fetch_gp_json(opener, SPACETRACK_GP_URL)
            if new:
                source = "space-track"
            decayed_ids = refresh_decay_ids(opener, DECAY_IDS_PATH)
    if not new:
        new = fetch_celestrak(CELESTRAK_URL)
        if new:
            source = "celestrak"

    if not new:
        print("fetch-tles: all sources failed, keeping existing data")
        raise SystemExit(1)

    merged = merge_tles(existing, new)
    merged, decayed = drop_decayed(merged, decayed_ids)
    save_json(list(merged.values()), TLE_PATH)
    TLE_PATH.parent.joinpath("last-updated.json").write_text(
        json.dumps({"count": len(merged), "source": source, "updated": datetime.now(timezone.utc).isoformat()})
    )
    print(f"fetch-tles: {source}, +{len(new)} fetched, {len(merged)} total, -{decayed} decayed")


if __name__ == "__main__":
    main()
