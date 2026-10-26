"""
Satellite TLE data fetcher.

Fetches TLE data from space-track.org (with auth) or CelesTrak (public fallback).
Implements incremental updates per Space-Track best practices:
  - Use EPOCH/>now-1 to only fetch recently updated TLEs
  - Merge with existing data to avoid re-downloading the full catalog
"""

from __future__ import annotations

import contextlib
import http.cookiejar
import json
import ssl
import urllib.parse
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, TypedDict


class _TleRequired(TypedDict):
    name: str
    line1: str
    line2: str


class TleRecord(_TleRequired, total=False):
    # Attached during enrichment; see enrich_object_types()/enrich_categories().
    objectType: str
    category: str


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


def _fetch_celestrak_text(url: str, timeout: int = 30) -> str | None:
    """GET text from CelesTrak (public, no auth). Tries strict SSL, then relaxed
    (CelesTrak's certificate has historically expired)."""
    for ctx in (None, _relaxed_ssl_context()):
        req = urllib.request.Request(url, headers={"User-Agent": "satellite-api/1.0"})
        try:
            if ctx is not None:
                resp = urllib.request.urlopen(req, timeout=timeout, context=ctx)  # type: ignore[arg-type]
            else:
                resp = urllib.request.urlopen(req, timeout=timeout)
            with resp:
                data = resp.read().decode("utf-8")
                if data.strip() and "403" not in data[:200]:
                    return data
        except Exception:
            continue
    return None


def fetch_celestrak(url: str, timeout: int = 30) -> list[TleRecord] | None:
    """Fetch TLE data from CelesTrak (public, no auth). None on failure."""
    text = _fetch_celestrak_text(url, timeout)
    return parse_tle_text(text) if text is not None else None


def fetch_celestrak_json(url: str, timeout: int = 30) -> Any | None:
    """Fetch JSON from CelesTrak (public, no auth). None on failure."""
    text = _fetch_celestrak_text(url, timeout)
    if text is None:
        return None
    try:
        return json.loads(text)
    except Exception:
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
SPACETRACK_SATCAT_URL = (
    "https://www.space-track.org/basicspacedata/query/class/satcat"
    "/decay/null-val/orderby/NORAD_CAT_ID/format/json"
)
SPACETRACK_DECAY_FULL_URL = (
    "https://www.space-track.org/basicspacedata/query/class/decay/format/json"
)
SPACETRACK_DECAY_RECENT_URL = (
    "https://www.space-track.org/basicspacedata/query/class/decay/MSG_EPOCH/%3Enow-1/format/json"
)
CELESTRAK_URL = "https://www.celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
CELESTRAK_GROUP_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=json"
TLE_PATH = Path("/var/www/satellite-api/tles.json")
DECAY_IDS_PATH = Path("/var/www/satellite-api/decayed-ids.json")
OBJECT_TYPES_PATH = Path("/var/www/satellite-api/object-types.json")
CATEGORIES_PATH = Path("/var/www/satellite-api/categories.json")
# Space-Track allows the decay class once per day; skip the refresh when the
# stored set is newer than this (the GP fetch itself may run hourly). The SATCAT
# query is bulk (one row per on-orbit object), so it is throttled the same way.
DECAY_REFRESH_INTERVAL_S = 20 * 3600
OBJECT_TYPE_REFRESH_INTERVAL_S = 20 * 3600
CATEGORY_REFRESH_INTERVAL_S = 20 * 3600
CREDS_PATH = Path.home() / ".config" / "satellite-api" / "spacetrack-creds"


# CelesTrak's curated groups mapped onto our function buckets, in priority order:
# the first group (from the top) that lists an object wins, so specific groups are
# checked before broad ones like `geo`.
_GROUP_CATEGORIES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("military", ("military",)),
    ("navigation", ("gnss", "gps-ops", "glo-ops", "galileo", "beidou", "sbas")),
    ("weather", ("weather",)),
    ("earth-observation", ("resource", "sar", "sarsat", "dmc", "argos", "planet", "spire")),
    ("science", ("science", "geodetic", "engineering", "education")),
    (
        "communications",
        (
            "geo",
            "intelsat",
            "ses",
            "eutelsat",
            "telesat",
            "starlink",
            "oneweb",
            "qianfan",
            "hulianwang",
            "kuiper",
            "iridium-NEXT",
            "orbcomm",
            "globalstar",
            "amateur",
            "satnogs",
            "x-comm",
            "other-comm",
            "tdrss",
        ),
    ),
    ("other", ("radar", "cubesat", "analyst")),
)

# Lower rank = higher priority; avoids downgrading a cached category to a
# lower-priority group when a higher-priority group failed to download.
_CATEGORY_RANK: dict[str, int] = {
    category: index for index, (category, _) in enumerate(_GROUP_CATEGORIES)
}


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
            age_s = datetime.now(UTC).timestamp() - ids_path.stat().st_mtime
        except OSError:
            age_s = float("inf")
        if age_s < DECAY_REFRESH_INTERVAL_S:
            return known
    url = SPACETRACK_DECAY_RECENT_URL if known else SPACETRACK_DECAY_FULL_URL
    fresh = (fetch or fetch_decay_ids)(opener, url)
    if fresh is None:
        return known
    known |= fresh
    with contextlib.suppress(Exception):
        save_decay_ids(ids_path, known)
    return known


def drop_decayed(
    merged: dict[str, TleRecord], decayed_ids: set[str]
) -> tuple[dict[str, TleRecord], int]:
    """Remove merged records whose NORAD ID decayed. Unparsable IDs are kept."""
    kept = {
        name: tle
        for name, tle in merged.items()
        if (cat_id := norad_id(tle["line1"])) is None or cat_id not in decayed_ids
    }
    return kept, len(merged) - len(kept)


def normalize_object_type(raw: Any) -> str:
    """Lowercase, hyphenated SATCAT object type ('ROCKET BODY' -> 'rocket-body')."""
    if raw is None:
        return "unknown"
    value = str(raw).strip().lower().replace(" ", "-")
    return "unknown" if value in ("", "tba") else value


def _norad_key(value: Any) -> str | None:
    """Normalize a NORAD catalog id to the string form used as a map key."""
    try:
        return str(int(value))
    except (TypeError, ValueError, OverflowError):
        return None


def parse_object_types(records: list[dict[str, Any]]) -> dict[str, str]:
    """NORAD ID -> object type from SATCAT records (unparsable rows skipped)."""
    types: dict[str, str] = {}
    for rec in records:
        norad = _norad_key(rec.get("NORAD_CAT_ID"))
        if norad is None:
            continue
        types[norad] = normalize_object_type(rec.get("OBJECT_TYPE", ""))
    return types


def fetch_object_types(opener: urllib.request.OpenerDirector, url: str) -> dict[str, str] | None:
    """Fetch SATCAT object types. None on failure (caller keeps old data)."""
    data = fetch_json(opener, url)
    if not isinstance(data, list):
        return None
    try:
        return parse_object_types(data)
    except Exception:
        return None


def _load_str_map(path: Path) -> dict[str, str]:
    """Load a JSON string->string map; empty map when missing or corrupt."""
    try:
        raw = json.loads(path.read_text())
    except Exception:
        return {}
    if not isinstance(raw, dict):
        return {}
    return {str(k): str(v) for k, v in raw.items()}


def _save_str_map(path: Path, mapping: dict[str, str]) -> None:
    """Atomically write a JSON string->string map."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(mapping, sort_keys=True))
    tmp.rename(path)


def load_object_types(path: Path) -> dict[str, str]:
    """Load stored object types; empty map when missing or corrupt."""
    return _load_str_map(path)


def save_object_types(path: Path, types: dict[str, str]) -> None:
    """Atomically write object types as JSON."""
    _save_str_map(path, types)


def refresh_object_types(
    opener: urllib.request.OpenerDirector,
    path: Path,
    fetch: Callable[[urllib.request.OpenerDirector, str], dict[str, str] | None] | None = None,
) -> dict[str, str]:
    """Merge stored object types with a fresh SATCAT pull (new values win).

    Skips the pull when the stored map is newer than OBJECT_TYPE_REFRESH_INTERVAL_S.
    Never raises; auxiliary state must not break the TLE update.
    """
    known = load_object_types(path)
    if path.exists():
        try:
            age_s = datetime.now(UTC).timestamp() - path.stat().st_mtime
        except OSError:
            age_s = float("inf")
        if age_s < OBJECT_TYPE_REFRESH_INTERVAL_S:
            return known
    fresh = (fetch or fetch_object_types)(opener, SPACETRACK_SATCAT_URL)
    if fresh is None:
        return known
    known.update(fresh)
    with contextlib.suppress(Exception):
        save_object_types(path, known)
    return known


def _enrich(
    merged: dict[str, TleRecord], mapping: dict[str, str], field: Literal["objectType", "category"]
) -> dict[str, TleRecord]:
    """Set `field` on each record from `mapping` where the NORAD ID matches."""
    for rec in merged.values():
        norad = norad_id(rec["line1"])
        value = mapping.get(norad) if norad is not None else None
        if value is not None:
            rec[field] = value
    return merged


def enrich_object_types(
    merged: dict[str, TleRecord], types: dict[str, str]
) -> dict[str, TleRecord]:
    """Set objectType on each record from SATCAT where a NORAD ID matches."""
    return _enrich(merged, types, "objectType")


def _fetch_group(group: str) -> list[dict[str, Any]] | None:
    data = fetch_celestrak_json(CELESTRAK_GROUP_URL.format(group=group))
    return data if isinstance(data, list) else None


def load_categories(path: Path) -> dict[str, str]:
    """Load stored categories; empty map when missing or corrupt."""
    return _load_str_map(path)


def save_categories(path: Path, categories: dict[str, str]) -> None:
    """Atomically write categories as JSON."""
    _save_str_map(path, categories)


def fetch_categories(
    fetch: Callable[[str], list[dict[str, Any]] | None] | None = None,
) -> dict[str, str] | None:
    """NORAD ID -> function category from CelesTrak group membership.

    Downloads every group in one pass (CelesTrak's rate limit is per group, so a
    whole-set download is fine). Groups are visited in priority order, so the first
    that lists an object wins. None when every group fetch fails (caller keeps the
    cached map).
    """
    get = fetch or _fetch_group
    categories: dict[str, str] = {}
    fetched_any = False
    for category, groups in _GROUP_CATEGORIES:
        for group in groups:
            data = get(group)
            if not isinstance(data, list):
                continue
            fetched_any = True
            for rec in data:
                if not isinstance(rec, dict):
                    continue
                norad = _norad_key(rec.get("NORAD_CAT_ID"))
                if norad is not None and norad not in categories:
                    categories[norad] = category
    return categories if fetched_any else None


def refresh_categories(
    path: Path,
    fetch: Callable[[str], list[dict[str, Any]] | None] | None = None,
) -> dict[str, str]:
    """Merge stored categories with a fresh CelesTrak group pull (new values win).

    Skips the pull when the stored map is newer than CATEGORY_REFRESH_INTERVAL_S.
    Never raises; auxiliary state must not break the TLE update.
    """
    known = load_categories(path)
    if path.exists():
        try:
            age_s = datetime.now(UTC).timestamp() - path.stat().st_mtime
        except OSError:
            age_s = float("inf")
        if age_s < CATEGORY_REFRESH_INTERVAL_S:
            return known
    try:
        fresh = fetch_categories(fetch)
    except Exception:
        return known
    if not fresh:
        return known
    unknown_rank = len(_CATEGORY_RANK)
    for norad, category in fresh.items():
        current = known.get(norad)
        if current is None or _CATEGORY_RANK.get(category, unknown_rank) <= _CATEGORY_RANK.get(
            current, unknown_rank
        ):
            known[norad] = category
    with contextlib.suppress(Exception):
        save_categories(path, known)
    return known


def enrich_categories(
    merged: dict[str, TleRecord], categories: dict[str, str]
) -> dict[str, TleRecord]:
    """Set category on each record from CelesTrak groups where a NORAD ID matches."""
    return _enrich(merged, categories, "category")


def main() -> None:
    existing = load_existing(TLE_PATH)
    new: list[TleRecord] | None = None
    source = "none"

    try:
        username, _, password = CREDS_PATH.read_text().strip().partition(":")
    except Exception:
        username, password = "", ""
    decayed_ids: set[str] = set()
    # Honor the cached types even when Space-Track is unreachable this run.
    object_types: dict[str, str] = load_object_types(OBJECT_TYPES_PATH)
    if username and password:
        opener, ok = make_spacetrack_opener(username, password, SPACETRACK_AUTH_URL)
        if ok:
            new = fetch_gp_json(opener, SPACETRACK_GP_URL)
            if new:
                source = "space-track"
            decayed_ids = refresh_decay_ids(opener, DECAY_IDS_PATH)
            object_types = refresh_object_types(opener, OBJECT_TYPES_PATH)
    if not new:
        new = fetch_celestrak(CELESTRAK_URL)
        if new:
            source = "celestrak"

    if not new:
        print("fetch-tles: all sources failed, keeping existing data")
        raise SystemExit(1)

    merged = merge_tles(existing, new)
    merged, decayed = drop_decayed(merged, decayed_ids)
    # Function categories come from public CelesTrak groups (no auth needed).
    categories = refresh_categories(CATEGORIES_PATH)
    merged = enrich_object_types(merged, object_types)
    merged = enrich_categories(merged, categories)
    save_json(list(merged.values()), TLE_PATH)
    TLE_PATH.parent.joinpath("last-updated.json").write_text(
        json.dumps(
            {"count": len(merged), "source": source, "updated": datetime.now(UTC).isoformat()}
        )
    )
    print(f"fetch-tles: {source}, +{len(new)} fetched, {len(merged)} total, -{decayed} decayed")


if __name__ == "__main__":
    main()
