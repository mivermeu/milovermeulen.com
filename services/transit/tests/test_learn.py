"""Learned run-time priors: visit collapsing, censoring, shrinkage and output."""

from __future__ import annotations

import json

from .. import learn

GRAPH = {
    "v": 2,
    "patterns": [
        {
            "id": "T-N",
            "route": "T",
            "dir": "N",
            "stops": [["T1N", 0.0], ["T2N", 400.0], ["T3N", 700.0]],
            "edge_times": [[60.0, 10.0], [40.0, 10.0]],
        }
    ],
}


def row(t: int, stop: str, train: str = "A", pre: bool = False) -> dict:
    return {"t": t, "id": train, "pattern": "T-N", "stop": stop, "pre": pre}


def test_a_station_transition_becomes_one_edge_sample():
    samples = learn.collect(iter([row(1000, "T1N"), row(1060, "T1N"), row(1090, "T2N")]), GRAPH)
    values = list(samples[("T-N", 0)][1])
    assert values == [90.0]  # first seen at T1N -> first seen at T2N


def test_a_skipped_stop_is_not_invented_as_an_edge():
    samples = learn.collect(iter([row(1000, "T1N"), row(1100, "T3N")]), GRAPH)
    assert samples == {}


def test_a_reversal_starts_a_new_visit():
    samples = learn.collect(
        iter([row(1000, "T2N"), row(1060, "T1N"), row(1120, "T2N")]), GRAPH
    )
    # Only the T1N -> T2N return is a forward edge.
    assert list(samples[("T-N", 0)][1]) == [60.0]


def test_placeholders_are_skipped():
    samples = learn.collect(iter([row(1000, "T1N"), row(1060, "T2N", pre=True)]), GRAPH)
    assert samples == {}


def test_a_layover_does_not_become_a_run_time():
    # Ten minutes at the origin: the visit is a layover, so the sample is dropped.
    samples = learn.collect(iter([row(1000, "T1N"), row(1600, "T1N"), row(1660, "T2N")]), GRAPH)
    assert samples == {}


def test_fit_on_rows_end_to_end(monkeypatch):
    rows = []
    for index in range(50):
        base = 1_000_000 + index * 3600
        train = f"A{index}"
        rows.append(row(base, "T1N", train=train))
        rows.append(row(base + 80, "T2N", train=train))
        rows.append(row(base + 150, "T3N", train=train))
    monkeypatch.setattr(learn, "iter_rows", lambda _paths: iter(rows))

    artifact = learn.fit([], GRAPH, "hash", now=2_000_000.0, min_samples=5)
    run, count = artifact["edges"]["T-N"][0]
    assert count == 50
    assert run == 70.0  # 80 s station-to-station minus the 10 s scheduled dwell
    assert artifact["edges"]["T-N"][1][0] == 60.0  # 70 s station-to-station minus 10 s dwell
    assert artifact["samples"] == 100
    assert len(artifact["hour_factor"]) == 2
    assert len(artifact["hour_factor"][0]) == 24


def test_edges_with_too_few_samples_are_omitted():
    artifact = learn.fit([], GRAPH, "hash", now=2000.0, min_samples=5)
    assert artifact["edges"]["T-N"][0] == [None, 0]


def test_write_is_content_addressed(tmp_path):
    artifact = {"v": 1, "graph": "abc123", "edges": {}, "hour_factor": []}
    path = learn.write(artifact, tmp_path)
    assert path.name == "runtime-abc123.json"
    assert json.loads(path.read_text())["graph"] == "abc123"
    assert learn.load(tmp_path, "abc123") == artifact
    assert learn.load(tmp_path, "missing") is None
