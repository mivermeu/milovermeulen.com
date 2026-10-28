"""Arrival/departure events: one row per observed stop transition.

The series samples *predictions* every 60 s; those gaps are too coarse to label
an arrival. Here each poll compares the vehicle's stop/sequence/status with the
previous poll and emits the transition:

* ``arrive``   from ``STOPPED_AT`` (the unbiased signal) or, when the dwell fell
  between polls, from a sequence advance (biased late by the dwell).
* ``depart``   from ``STOPPED_AT`` to anything else.
* ``skip``     when the sequence jumps more than one stop.
* ``trip_end`` when the train's trip changes (short-turn) or it vanishes after
  stopping.
* ``disappeared`` when the train vanishes mid-trip.
* ``cancel``   when the feed marks the trip cancelled.

Every event carries the poll bracket it was observed in (``t_lo`` / ``t_hi``),
the previous prediction for that stop, and whether it came from status or a
sequence fallback. Brackets that span a restart or a failed cycle are dropped:
they are unbounded, and an unbounded label is worse than no label.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from . import gtfs

SCHEMA_VERSION = 1
GONE_AFTER_S = 90.0


@dataclass(slots=True)
class Observation:
    key: str
    trip: str | None
    start: str | None
    route: str | None
    stop: str | None
    seq: int | None
    status: int | None
    vehicle_ts: int | None
    feed: str
    predictions: dict[str, int] = field(default_factory=dict)
    confidence: float | None = None


class EventTracker:
    """Stateful across poll cycles; one instance per poller."""

    def __init__(self) -> None:
        self.previous: dict[str, Observation] = {}
        self.seen_at: dict[str, float] = {}
        self.cancelled: set[tuple[str, str | None]] = set()
        self.boot: str | None = None
        self.emitted = 0

    def observe(
        self,
        trip_feeds: dict[str, gtfs.Feed],
        positions: dict[str, dict[str, Any]],
        now: float,
        *,
        first_cycle: bool = False,
        previous_ok: bool = True,
        failed: set[str] | None = None,
        previous_failed: set[str] | None = None,
        gone_after: float = GONE_AFTER_S,
        boot: str | None = None,
    ) -> list[dict[str, Any]]:
        self.boot = boot or self.boot
        gap = first_cycle or not previous_ok
        failed_now = failed or set()
        failed_before = previous_failed or set()
        current = self._collect(trip_feeds, positions)
        events: list[dict[str, Any]] = []

        # Cancelled trips usually carry no vehicle, so they never reach `current`.
        events.extend(self._cancel_events(trip_feeds, now))

        for key, observation in current.items():
            previous = self.previous.get(key)
            if previous is not None and not gap and previous.feed not in failed_before:
                # A bracket that spans a cycle where this feed was down is
                # unbounded; skip it and keep the fresh state.
                events.extend(
                    self._transitions(previous, observation, self.seen_at.get(key, now), now)
                )
            self.previous[key] = observation
            self.seen_at[key] = now

        for key in list(self.previous):
            if key in current:
                continue
            previous = self.previous[key]
            if previous.feed in failed_now or previous.feed in failed_before:
                # The feed is down, not the trains. Drop the state silently so a
                # recovery starts fresh instead of reporting a fake trip end.
                del self.previous[key]
                self.seen_at.pop(key, None)
                self.cancelled = {entry for entry in self.cancelled if entry[0] != key}
                continue
            last = self.seen_at.get(key, now)
            if now - last < gone_after:
                # One missed poll is a hiccup, not a disappearance.
                continue
            if not gap:
                kind = "trip_end" if previous.status == 1 else "disappeared"
                events.append(self._event(previous, kind, last, now, "absence", None))
            del self.previous[key]
            self.seen_at.pop(key, None)
            self.cancelled = {entry for entry in self.cancelled if entry[0] != key}

        self.emitted += len(events)
        return events

    # -- collection --------------------------------------------------------

    def _collect(
        self, trip_feeds: dict[str, gtfs.Feed], positions: dict[str, dict[str, Any]]
    ) -> dict[str, Observation]:
        observations: dict[str, Observation] = {}
        for feed_name, feed in trip_feeds.items():
            vehicles = {vehicle.trip_id: vehicle for vehicle in feed.vehicles if vehicle.trip_id}
            for update in feed.trip_updates:
                vehicle = vehicles.get(update.trip.trip_id)
                if vehicle is None:
                    continue
                key = update.trip.train_id or vehicle.vehicle_id or update.trip.trip_id or ""
                if key in observations:
                    continue
                observed_stop = vehicle.stop_id
                if not observed_stop:
                    observed_stop = next(
                        (stop.stop_id for stop in update.stop_time_updates if stop.stop_id), None
                    )
                predictions: dict[str, int] = {}
                for stop in update.stop_time_updates:
                    arrival = stop.arrival.time if stop.arrival else None
                    departure = stop.departure.time if stop.departure else None
                    when = arrival or departure
                    if stop.stop_id and when:
                        predictions[stop.stop_id] = when
                position = positions.get(key, {})
                observations[key] = Observation(
                    key=key,
                    trip=update.trip.trip_id,
                    start=update.trip.start_date,
                    route=update.trip.route_id,
                    stop=observed_stop,
                    seq=vehicle.current_stop_sequence,
                    status=vehicle.current_status,
                    vehicle_ts=vehicle.timestamp,
                    feed=feed_name,
                    predictions=predictions,
                    confidence=position.get("confidence"),
                )
        return observations

    # -- transitions -------------------------------------------------------

    def _transitions(
        self, previous: Observation, current: Observation, t_lo: float, t_hi: float
    ) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []

        if previous.trip != current.trip:
            # The same physical train started a new trip (short-turn) or the feed
            # reassigned it. Close the old trip rather than inventing a position.
            if previous.trip:
                events.append(self._event(previous, "trip_end", t_lo, t_hi, "trip_change", None))
            return events

        # Departure first: a dwell that ended shows as a status change.
        if previous.status == 1 and (current.status != 1 or current.stop != previous.stop):
            events.append(self._event(previous, "depart", t_lo, t_hi, "status", None))

        if current.seq is not None and previous.seq is not None and current.seq > previous.seq:
            if current.seq - previous.seq > 1:
                # The skipped stop is the one the train was heading to, not the
                # one it is at now. If the previous poll was already a platform
                # stop, the intermediate stops are unknown.
                skipped_stop = previous.stop if previous.status != 1 else None
                events.append(
                    self._event(
                        previous,
                        "skip",
                        t_lo,
                        t_hi,
                        "seq",
                        None,
                        from_seq=previous.seq,
                        to_seq=current.seq,
                        stop=skipped_stop,
                    )
                )
            # If the dwell was never observed, the train still passed the stop it
            # was heading to. Both events carry source `seq`, so consumers can
            # keep only status-derived dwells.
            if previous.status != 1 and previous.stop:
                predicted = previous.predictions.get(previous.stop)
                events.append(self._event(previous, "arrive", t_lo, t_hi, "seq", predicted))
                events.append(self._event(previous, "depart", t_lo, t_hi, "seq", None))

        # Arrival via the unbiased signal: observed at the platform.
        if current.status == 1 and (previous.status != 1 or previous.stop != current.stop):
            predicted = previous.predictions.get(current.stop or "")
            events.append(self._event(current, "arrive", t_lo, t_hi, "status", predicted))

        return events

    def _cancel_events(self, trip_feeds: dict[str, gtfs.Feed], now: float) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        for feed_name, feed in trip_feeds.items():
            for update in feed.trip_updates:
                relationship = update.trip.schedule_relationship
                if relationship not in (gtfs.SCHEDULE_CANCELED, gtfs.SCHEDULE_DELETED):
                    continue
                key = update.trip.train_id or update.trip.trip_id or ""
                marker = (key, update.trip.trip_id)
                if marker in self.cancelled:
                    continue
                self.cancelled.add(marker)
                observation = Observation(
                    key=key,
                    trip=update.trip.trip_id,
                    start=update.trip.start_date,
                    route=update.trip.route_id,
                    stop=None,
                    seq=None,
                    status=None,
                    vehicle_ts=None,
                    feed=feed_name,
                )
                events.append(self._event(observation, "cancel", now, now, "schedule", None))
        return events

    # -- row ---------------------------------------------------------------

    def _event(
        self,
        observation: Observation,
        kind: str,
        t_lo: float,
        t_hi: float,
        source: str,
        prediction: int | None,
        from_seq: int | None = None,
        to_seq: int | None = None,
        stop: str | None = None,
    ) -> dict[str, Any]:
        row: dict[str, Any] = {
            "v": SCHEMA_VERSION,
            "t_lo": int(t_lo),
            "t_hi": int(t_hi),
            "kind": kind,
            "id": observation.key,
            "trip": observation.trip,
            "start": observation.start,
            "route": observation.route,
            "stop": stop if stop is not None else observation.stop,
            "seq": observation.seq,
            "source": source,
            "predicted_at": prediction,
            "vehicle_ts": observation.vehicle_ts,
            "feed": observation.feed,
            "conf": observation.confidence,
            "boot": self.boot,
        }
        if from_seq is not None:
            row["from_seq"] = from_seq
        if to_seq is not None:
            row["to_seq"] = to_seq
        return row
