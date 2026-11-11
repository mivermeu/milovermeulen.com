"""Trajectory history: run collapsing, resampling, capping and artifacts."""

from __future__ import annotations

import json

from .. import history


def row(
    t: int,
    s: float,
    train: str = "A",
    pattern: str = "P-abc",
    pre: bool = False,
    trip: str | None = None,
) -> dict:
    return {"t": t, "id": train, "pattern": pattern, "s": s, "pre": pre, "trip": trip}


def leg(train: str = "A", start: int = 1_000_000, steps: int = 40, pattern: str = "P-abc"):
    return [row(start + i * 30, i * 40.0, train, pattern) for i in range(steps)]


def test_a_run_is_resampled_onto_a_fixed_grid():
    runs = history.runs_from_rows(iter(leg(steps=40)))
    assert len(runs) == 1
    run = runs[0]
    assert run["dt"] == 30
    assert run["start"] == 1_000_000
    assert len(run["s"]) == 40
    assert run["s"][0] == 0
    assert run["s"][-1] == 40 * 39


def test_a_gap_starts_a_new_run():
    rows = leg(steps=20) + leg(start=1_000_000 + 20 * 30 + 301, steps=20)
    assert len(history.runs_from_rows(iter(rows))) == 2


def test_a_reversal_starts_a_new_run():
    # A restart at the origin, far enough back to be unambiguous.
    first = [row(1_000_000 + i * 30, i * 40.0) for i in range(80)]
    second = [row(1_000_000 + 2400 + i * 30, i * 40.0) for i in range(20)]
    assert len(history.runs_from_rows(iter(first + second))) == 2


def test_a_new_trip_id_starts_a_new_run():
    first = [row(1_000_000 + i * 30, i * 40.0, trip="t1") for i in range(20)]
    second = [row(1_000_000 + 600 + i * 30, i * 40.0, trip="t2") for i in range(20)]
    assert len(history.runs_from_rows(iter(first + second))) == 2


def test_short_or_static_runs_are_dropped():
    short = [row(1_000_000 + i * 30, i * 40) for i in range(5)]
    static = [row(1_000_000 + i * 30, 100) for i in range(40)]
    assert history.runs_from_rows(iter(short)) == []
    assert history.runs_from_rows(iter(static)) == []


def test_placeholders_are_ignored():
    rows = [*leg(steps=20), row(1_000_000 + 600, 0, pre=True)]
    assert len(history.runs_from_rows(iter(rows))) == 1


def test_runs_carry_local_hour_and_weekend():
    run = history.runs_from_rows(iter(leg(start=1_790_000_000)))[0]
    assert 0 <= run["h"] <= 23
    assert run["w"] in (0, 1)


def test_build_reads_rows_and_caps(monkeypatch):
    rows = []
    for index in range(10):
        rows += leg(train=f"A{index}", start=1_000_000 + index * 10_000)
    monkeypatch.setattr(history.learn, "iter_rows", lambda _paths: iter(rows))
    documents = history.build([], "hash", now=2_000_000, max_runs=4)
    assert documents["P-abc"]["runs"].__len__() == 4
    starts = [run["start"] for run in documents["P-abc"]["runs"]]
    assert starts == sorted(starts)


def test_write_is_content_addressed_and_prunes_old_hashes(tmp_path):
    (tmp_path / "history-v1-old-aaaaaaaaaaaa-P-abc.json").write_text("{}")
    documents = {
        "P-abc": {"v": 1, "pattern": "P-abc", "graph": "new", "runs": []},
        "P-def": {"v": 1, "pattern": "P-def", "graph": "new", "runs": []},
    }
    written = history.write_artifacts(documents, tmp_path, "new")
    assert written == 2
    assert (tmp_path / "history-v2-new-P-abc.json").exists()
    assert (tmp_path / "history-v2-new-P-def.json").exists()
    assert not (tmp_path / "history-v1-old-aaaaaaaaaaaa-P-abc.json").exists()
    assert json.loads((tmp_path / "history-v2-new-P-abc.json").read_text())["pattern"] == "P-abc"
