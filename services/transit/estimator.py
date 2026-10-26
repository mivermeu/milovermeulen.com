"""Turn stop-level observations into a position along the track graph.

B1 could say "train 1G is stopped at G29S". This turns that into
``edge + s + v`` — where the train is *between* stations and how fast it is
moving — by joining the trip to a static pattern and reconciling each observation
against the previous one.

Three rules keep it from snapping:

* an observation is a target, not a teleport: the error is bled off with a
  critically-damped correction over a few seconds;
* a re-route (error over ``RESET_M``) is the one case that re-anchors instantly,
  because the train really is somewhere else on a new path;
* state is keyed by NYCT ``train_id``, not ``trip_id``, so a short-turn — the same
  physical train starting a new trip — continues instead of jumping.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Any

from . import gtfs, join

# Corrections are bled off with this time constant.
TAU_S = 5.0
# Error above which the train is assumed to be on a different path (re-route).
RESET_M = 600.0
# Vehicle timestamps older than this make a position untrustworthy.
STALE_S = 60.0
# Typical in-motion speed used to place a train on a segment with no history.
CRUISE_MPS = 12.0
MAX_SPEED_MPS = 30.0


@dataclass(slots=True)
class Position:
    pattern: str
    edge: str
    s: float
    s_total: float
    v: float
    confidence: float
    stale: bool
    reset: bool = False


@dataclass(slots=True)
class TrainState:
    key: str
    pattern: str
    s: float
    v: float
    last_seen: float
    trip_id: str | None = None


@dataclass(slots=True)
class Estimator:
    """Stateful across poll cycles; one instance per poller."""

    patterns: dict[str, dict[str, Any]] = field(default_factory=dict)
    distances: dict[str, dict[str, float]] = field(default_factory=dict)
    lengths: dict[str, float] = field(default_factory=dict)
    index: join.PatternIndex | None = None
    states: dict[str, TrainState] = field(default_factory=dict)
    graph_hash: str | None = None
    unmatched: int = 0
    duplicates: int = 0
    without_vehicle: int = 0

    def set_graph(self, document: dict[str, Any], graph_hash: str | None = None) -> None:
        self.patterns = {pattern["id"]: pattern for pattern in document.get("patterns", [])}
        self.distances = {
            pattern_id: {stop: dist for stop, dist in pattern["stops"]}
            for pattern_id, pattern in self.patterns.items()
        }
        self.lengths = {
            pattern_id: (pattern["stops"][-1][1] if pattern["stops"] else 0.0)
            for pattern_id, pattern in self.patterns.items()
        }
        self.index = join.PatternIndex(document)
        self.graph_hash = graph_hash

    def update(self, trip_feeds: dict[str, gtfs.Feed], now: float | None = None) -> dict[str, dict]:
        """Return ``{train_id: position}`` for every train observed this cycle."""
        stamp = time.time() if now is None else now
        positions: dict[str, dict] = {}
        seen: set[str] = set()
        self.unmatched = 0
        self.duplicates = 0
        self.without_vehicle = 0

        for feed in trip_feeds.values():
            for update in feed.trip_updates:
                vehicle = self._vehicle_for(feed, update.trip.trip_id)
                if vehicle is None:
                    # The snapshot only renders trains that have a vehicle; keeping
                    # state for the rest would seed positions nothing displays.
                    self.without_vehicle += 1
                    continue
                key = self._key(update, vehicle)
                stop_ids = [stop.stop_id for stop in update.stop_time_updates if stop.stop_id]
                match = (
                    self.index.match(
                        update.trip.route_id, stop_ids, gtfs.trip_direction(update.trip)
                    )
                    if self.index
                    else None
                )
                if match is None:
                    self.unmatched += 1
                    continue
                target = self._target(update, vehicle, match, stamp)
                if target is None:
                    continue
                if key in positions:
                    # Two trips sharing a train_id: the later one would silently
                    # overwrite the first. Count it instead.
                    self.duplicates += 1
                    continue
                seen.add(key)
                position = self._reconcile(key, update, vehicle, match, target, stamp)
                positions[key] = {
                    "pattern": position.pattern,
                    "edge": position.edge,
                    "s": round(position.s, 1),
                    "s_total": round(position.s_total, 1),
                    "v": round(position.v, 1),
                    "confidence": round(position.confidence, 2),
                    "stale": position.stale,
                    "reset": position.reset,
                }

        for key in list(self.states):
            if key not in seen and stamp - self.states[key].last_seen > 4 * STALE_S:
                del self.states[key]
        return positions

    # -- observation -------------------------------------------------------

    @staticmethod
    def _vehicle_for(feed: gtfs.Feed, trip_id: str | None) -> gtfs.VehiclePosition | None:
        if not trip_id:
            return None
        for vehicle in feed.vehicles:
            if vehicle.trip_id == trip_id:
                return vehicle
        return None

    @staticmethod
    def _key(update: gtfs.TripUpdate, vehicle: gtfs.VehiclePosition | None) -> str:
        return (
            update.trip.train_id
            or (vehicle.vehicle_id if vehicle else None)
            or update.trip.trip_id
            or ""
        )

    def _target(
        self,
        update: gtfs.TripUpdate,
        vehicle: gtfs.VehiclePosition | None,
        match: join.Match,
        stamp: float,
    ) -> dict[str, Any] | None:
        distances = self.distances.get(match.pattern_id, {})
        stops = self.patterns.get(match.pattern_id, {}).get("stops", [])
        if len(stops) < 2:
            return None
        length = self.lengths.get(match.pattern_id, 0.0)

        observed_stop = vehicle.stop_id if vehicle else None
        if observed_stop not in distances and update.stop_time_updates:
            observed_stop = update.stop_time_updates[0].stop_id
        if observed_stop not in distances:
            return None

        index = next(
            (position for position, (stop, _) in enumerate(stops) if stop == observed_stop), 0
        )
        status = vehicle.current_status if vehicle else 2

        if status == 1 or index == 0:  # STOPPED_AT, or the first stop of the pattern
            return {
                "along": distances[observed_stop],
                "length": length,
                "in_transit": False,
                "segment_end": distances[observed_stop],
                "implied_v": 0.0,
            }

        previous_stop = stops[index - 1][0]
        start = distances[previous_stop]
        end = distances[observed_stop]
        along, implied = self._segment_fraction(update, observed_stop, start, end, stamp)
        return {
            "along": min(max(along, 0.0), length),
            "length": length,
            "in_transit": True,
            "segment_end": end,
            "implied_v": implied,
        }

    def _segment_fraction(
        self,
        update: gtfs.TripUpdate,
        stop_id: str,
        start: float,
        end: float,
        stamp: float,
    ) -> tuple[float, float]:
        """Where between two stops, and the speed the ETA implies for the rest.

        Uses the cycle time, not the vehicle's own timestamp: the latter advances
        with every observation, which would freeze the fraction and leave moving
        trains parked mid-segment.
        """
        arrival = next(
            (
                entry.departure or entry.arrival
                for entry in update.stop_time_updates
                if entry.stop_id == stop_id and (entry.departure or entry.arrival)
            ),
            None,
        )
        timestamp = arrival.time if arrival and arrival.time else None
        span = max(end - start, 1.0)
        if not timestamp:
            return (start + end) / 2, CRUISE_MPS
        remaining = max(timestamp - stamp, 1.0)
        implied = min(MAX_SPEED_MPS, max(2.0, span / remaining))
        run = span / CRUISE_MPS
        fraction = 1 - remaining / run
        return start + span * min(0.95, max(0.05, fraction)), implied

    # -- reconciliation ----------------------------------------------------

    def _reconcile(
        self,
        key: str,
        update: gtfs.TripUpdate,
        vehicle: gtfs.VehiclePosition | None,
        match: join.Match,
        target: dict[str, Any],
        stamp: float,
    ) -> Position:
        along = float(target["along"])
        length = float(target["length"])
        previous = self.states.get(key)
        confidence = match.confidence
        reset = False

        if previous is not None and previous.pattern != match.pattern_id:
            # Short-turn or re-route: the train is the same, the pattern is not.
            # Anchor to the new observation rather than carrying an s that belongs
            # to the old pattern's coordinate space (a short-turn restarts at 0).
            previous = TrainState(
                key=key,
                pattern=match.pattern_id,
                s=along,
                v=0.0,
                last_seen=previous.last_seen,
                trip_id=update.trip.trip_id,
            )

        if previous is None:
            s = along
            velocity = 0.0
        else:
            elapsed = max(stamp - previous.last_seen, 0.0)
            speed = previous.v
            if target["in_transit"]:
                speed = max(speed, float(target["implied_v"]))
            predicted = previous.s + speed * elapsed
            predicted = min(max(predicted, 0.0), length)
            if target["in_transit"]:
                # The ETA fraction alone freezes when MTA keeps pushing the arrival
                # back: it stays clamped at "just left". So advance from where the
                # train already is at the speed the ETA still implies for the rest
                # of the segment. Both shrink together, so this converges on the
                # next stop at the advertised time instead of stalling or overshooting.
                implied = float(target["implied_v"])
                along = max(along, previous.s + implied * elapsed)
                along = min(along, float(target["segment_end"]))
                predicted = min(predicted, float(target["segment_end"]))
            error = along - predicted
            if abs(error) > RESET_M + MAX_SPEED_MPS * elapsed:
                # Further than any train could travel in this cycle: a re-route,
                # a restart, or a bad placement. Anchor, and flag it so the client
                # can fade rather than animate the jump.
                s = along
                velocity = 0.0
                confidence *= 0.5
                reset = True
            else:
                # A correction is still motion: never move further in one cycle
                # than the fastest train could physically travel.
                limit = previous.s + MAX_SPEED_MPS * elapsed + 1.0
                alpha = 1 - math.exp(-elapsed / TAU_S) if elapsed > 0 else 1.0
                s = predicted + alpha * error
                s = min(s, limit)
                if target["in_transit"]:
                    velocity = (s - previous.s) / elapsed if elapsed > 0 else previous.v
                    velocity = min(max(velocity, 0.0), MAX_SPEED_MPS)
                else:
                    # A train observed stopped is stopped; the correction that
                    # brought it here is not current speed.
                    velocity = 0.0

        s = min(max(s, 0.0), length)
        stale = bool(vehicle and vehicle.timestamp and stamp - vehicle.timestamp > STALE_S)
        if stale:
            confidence *= 0.5
        confidence = min(max(confidence, 0.0), 1.0)

        self.states[key] = TrainState(
            key=key,
            pattern=match.pattern_id,
            s=s,
            v=velocity,
            last_seen=stamp,
            trip_id=update.trip.trip_id,
        )
        edge, local = self._locate(match.pattern_id, s)
        return Position(
            pattern=match.pattern_id,
            edge=edge,
            s=local,
            s_total=s,
            v=velocity,
            confidence=confidence,
            stale=stale,
            reset=reset,
        )

    def _locate(self, pattern_id: str, s: float) -> tuple[str, float]:
        stops = self.patterns[pattern_id]["stops"]
        index = 0
        while index + 1 < len(stops) and stops[index + 1][1] <= s:
            index += 1
        if index == len(stops) - 1 and index > 0:
            # At the terminal: report the last real edge at its end rather than a
            # zero-length self-edge the frontend cannot slice.
            index -= 1
        start = stops[index][1]
        end = stops[min(index + 1, len(stops) - 1)][1]
        edge = f"{pattern_id}:{index}:{stops[index][0]}>{stops[min(index + 1, len(stops) - 1)][0]}"
        return edge, min(s - start, end - start)
