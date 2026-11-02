"""Turn stop-level observations into a time-parameterised position.

The feed almost never says a train is between stations. Over a 48 h sample,
97.6% of in-service vehicle entities were ``STOPPED_AT`` a platform; the
placeholder entities that carry no status at all are 45% of the feed and say
nothing about position. So an observation is a **station event**, not a
position, and the estimator's job is to turn a sequence of events into a
*schedule*: when the train left this stop, when it reaches the next one, and
where that puts it now.

That is why state is a phase anchor rather than a velocity:

* ``edge`` + ``departed_at`` say when the train starts the edge it is on;
* run time comes from the trip's own arrival prediction when it has one, then
  from the learned per-edge median (``learn.py``), then from the static
  schedule carried in the graph, then from a cruise-speed fallback;
* dwell comes from the schedule, so a train does not freeze at a platform
  until the next poll rescues it;
* the client receives the future stop timeline (``next`` + ``depart_at``) and
  evaluates the same trapezoidal profile, so the 30 s poll cadence never
  enters the render path.

Consistency is still enforced: a jump larger than a train could cover in the
cycle is re-anchored and flagged ``reset`` for the client to fade. Everything
smaller is simply a better phase estimate, and the client eases it.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from . import gtfs, join

# Vehicle timestamps older than this make a position untrustworthy.
STALE_S = 60.0
# A timestamp this far ahead of our clock is not a fresh observation.
FUTURE_SKEW_S = 60.0
# Error above which the train is assumed to be on a different path (re-route).
RESET_M = 600.0
# Fallbacks when neither the schedule nor the archive knows an edge.
CRUISE_MPS = 12.0
DEFAULT_DWELL_S = 18.0
MIN_RUN_S = 5.0
MAX_SPEED_MPS = 30.0
MAX_EDGE_S = 1800.0
# Fraction of an edge spent accelerating, and the same braking. The trapezoid
# peaks at ``span / (run * (1 - accel))``, so 0.18 gives a 1.22x cruise.
ACCEL_FRACTION = 0.18
# Future stops shipped for the client's timeline.
PLAN_STOPS = 6
LOCAL_ZONE = ZoneInfo("America/New_York")


@dataclass(slots=True)
class Position:
    pattern: str
    edge: str
    s: float
    s_total: float
    v: float
    confidence: float
    stale: bool
    reset: bool
    depart_at: float | None
    sigma: float
    next_stops: list[dict[str, Any]]


@dataclass(slots=True)
class TrainState:
    key: str
    pattern: str
    edge: int
    departed_at: float
    last_seen: float
    observed_at: float
    confidence: float
    trip_id: str | None = None
    status: int | None = None


def profile(elapsed: float, run: float) -> tuple[float, float]:
    """Fraction of an edge covered and normalised speed at ``elapsed``.

    A trapezoid: accelerate for ``ACCEL_FRACTION`` of the run, cruise, brake for
    the same fraction. Normalised so the integral over ``[0, run]`` is exactly 1.
    """
    if run <= 0 or elapsed <= 0:
        return 0.0, 0.0
    if elapsed >= run:
        return 1.0, 0.0
    taper = max(1e-6, run * ACCEL_FRACTION)
    cruise = 1.0 / (run - taper)
    if elapsed < taper:
        return 0.5 * cruise * elapsed * elapsed / taper, cruise * elapsed / taper
    if elapsed < run - taper:
        return 0.5 * cruise * taper + cruise * (elapsed - taper), cruise
    remaining = run - elapsed
    return 1.0 - 0.5 * cruise * remaining * remaining / taper, cruise * remaining / taper


@dataclass(slots=True)
class Estimator:
    """Stateful across poll cycles; one instance per poller."""

    patterns: dict[str, dict[str, Any]] = field(default_factory=dict)
    distances: dict[str, dict[str, float]] = field(default_factory=dict)
    lengths: dict[str, float] = field(default_factory=dict)
    index: join.PatternIndex | None = None
    states: dict[str, TrainState] = field(default_factory=dict)
    graph_hash: str | None = None
    runtime: dict[str, Any] | None = None
    unmatched: int = 0
    duplicates: int = 0
    without_vehicle: int = 0
    placeholders: int = 0
    placeholders_off_origin: int = 0
    observed: int = 0

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
        self.runtime = None

    def set_runtime(self, runtime: dict[str, Any] | None) -> None:
        """Attach the learned per-edge priors; absent or stale ones are ignored."""
        if runtime and runtime.get("graph") in (None, self.graph_hash):
            self.runtime = runtime
        else:
            self.runtime = None

    # -- priors ------------------------------------------------------------

    @staticmethod
    def _hour_factor(runtime: dict[str, Any] | None, at: float) -> float:
        if not runtime:
            return 1.0
        table = runtime.get("hour_factor") or []
        local = datetime.fromtimestamp(at, LOCAL_ZONE)
        kind = 0 if local.weekday() < 5 else 1
        if kind >= len(table) or local.hour >= len(table[kind]):
            return 1.0
        return float(table[kind][local.hour])

    def _run_seconds(self, pattern_id: str, edge: int, at: float, span: float) -> float:
        pattern = self.patterns.get(pattern_id, {})
        times = pattern.get("edge_times") or []
        scheduled = float(times[edge][0]) if edge < len(times) and times[edge][0] else 0.0
        learned = None
        if self.runtime:
            rows = (self.runtime.get("edges") or {}).get(pattern_id) or []
            if edge < len(rows) and rows[edge] and rows[edge][0]:
                learned = float(rows[edge][0])
        base = learned if learned else scheduled if scheduled > 0 else span / CRUISE_MPS
        if base <= 0:
            base = max(MIN_RUN_S, span / CRUISE_MPS)
        return max(MIN_RUN_S, min(MAX_EDGE_S, base * self._hour_factor(self.runtime, at)))

    def _dwell_seconds(self, pattern_id: str, stop_index: int, at: float) -> float:
        pattern = self.patterns.get(pattern_id, {})
        times = pattern.get("edge_times") or []
        # Dwell belongs to the stop at the start of the edge.
        scheduled = 0.0
        if stop_index < len(times) and times[stop_index][1]:
            scheduled = float(times[stop_index][1])
        dwell = scheduled if scheduled > 0 else DEFAULT_DWELL_S
        return max(4.0, min(120.0, dwell))

    def _edge_span(self, pattern_id: str, edge: int) -> float:
        stops = self.patterns.get(pattern_id, {}).get("stops") or []
        if edge + 1 >= len(stops):
            return 0.0
        return max(0.0, stops[edge + 1][1] - stops[edge][1])

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

    @staticmethod
    def _observation_time(vehicle: gtfs.VehiclePosition | None, stamp: float) -> float:
        if not vehicle or not vehicle.timestamp:
            return stamp
        observed = float(vehicle.timestamp)
        # A timestamp far in the past is stale, not an anchor; one in the future
        # is a clock problem. Both are clamped to the poll cycle.
        return min(stamp + FUTURE_SKEW_S, max(stamp - 4 * STALE_S, observed))

    def _predicted_arrival(
        self,
        update: gtfs.TripUpdate,
        stop_id: str,
        after: float,
    ) -> float | None:
        for entry in update.stop_time_updates:
            if entry.stop_id != stop_id:
                continue
            arrival = entry.arrival.time if entry.arrival else None
            departure = entry.departure.time if entry.departure else None
            value = arrival or departure
            if value and value >= after - 5:
                return float(value)
        return None

    def _anchor(
        self,
        update: gtfs.TripUpdate,
        vehicle: gtfs.VehiclePosition,
        match: join.Match,
        stamp: float,
    ) -> tuple[int, float] | None:
        """Return ``(edge, departed_at)`` from one station-level observation."""
        pattern_id = match.pattern_id
        stops = self.patterns.get(pattern_id, {}).get("stops") or []
        distances = self.distances.get(pattern_id, {})
        if len(stops) < 2:
            return None

        observed_stop = vehicle.stop_id
        if observed_stop not in distances:
            observed_stop = next(
                (stop.stop_id for stop in update.stop_time_updates if stop.stop_id in distances),
                None,
            )
        if observed_stop not in distances:
            return None
        index = next(position for position, (stop, _) in enumerate(stops) if stop == observed_stop)
        observed_at = self._observation_time(vehicle, stamp)
        status = vehicle.current_status

        if index >= len(stops) - 1:
            # At the terminal: there is no next edge to traverse.
            return len(stops) - 2, observed_at - self._run_seconds(
                pattern_id, len(stops) - 2, observed_at, self._edge_span(pattern_id, len(stops) - 2)
            )

        if status == 1:
            # Dwelling. The schedule says how long; if the observation is old
            # enough that the train has already left, the phase walks forward.
            return index, observed_at + self._dwell_seconds(pattern_id, index, observed_at)

        # IN_TRANSIT_TO / INCOMING_AT / an unset status with a sequence: the
        # train is on the edge before this stop. Place the departure so the
        # train arrives at the advertised time.
        edge = max(0, index - 1)
        run = self._run_seconds(pattern_id, edge, observed_at, self._edge_span(pattern_id, edge))
        arrival = self._predicted_arrival(update, observed_stop, observed_at)
        if arrival is None:
            # No prediction: the midpoint is the least-wrong single guess for a
            # train the feed only says is *somewhere* before this stop.
            arrival = observed_at + run / 2
        departed_at = min(observed_at, max(observed_at - run, arrival - run))
        return edge, departed_at

    # -- placement ---------------------------------------------------------

    def _place(
        self, pattern_id: str, edge: int, departed_at: float, at: float
    ) -> tuple[int, float, float, float]:
        """Walk edges from a phase anchor to ``at``.

        Returns the edge the train is on **now**, its distance along that edge,
        its speed, and the time it left (or will leave) that edge's start stop.
        The last value is the timeline anchor: for a dwelling train it is in the
        future, and it moves forward as the phase advances.
        """
        stops = self.patterns.get(pattern_id, {}).get("stops") or []
        last_edge = max(0, len(stops) - 2)
        edge = min(max(edge, 0), last_edge)
        current_departure = departed_at
        if at <= current_departure:
            return edge, 0.0, 0.0, current_departure
        remaining = at - current_departure
        while True:
            span = self._edge_span(pattern_id, edge)
            run = self._run_seconds(pattern_id, edge, at, span)
            if remaining < run or edge >= last_edge:
                fraction, speed = profile(remaining, run)
                return edge, fraction * span, speed * span, current_departure
            remaining -= run
            edge += 1
            if edge > last_edge:
                return last_edge, self._edge_span(pattern_id, last_edge), 0.0, current_departure
            dwell = self._dwell_seconds(pattern_id, edge - 1, at)
            current_departure = current_departure + run + dwell
            if remaining < dwell:
                # Dwelling at the stop that starts `edge`.
                return edge, 0.0, 0.0, current_departure
            remaining -= dwell

    def _locate(self, pattern_id: str, s_total: float) -> tuple[str, float]:
        stops = self.patterns[pattern_id]["stops"]
        index = 0
        while index + 1 < len(stops) and stops[index + 1][1] <= s_total:
            index += 1
        if index == len(stops) - 1 and index > 0:
            index -= 1
        start = stops[index][1]
        end = stops[min(index + 1, len(stops) - 1)][1]
        edge = f"{pattern_id}:{index}:{stops[index][0]}>{stops[min(index + 1, len(stops) - 1)][0]}"
        return edge, min(s_total - start, end - start)

    def _plan(
        self,
        update: gtfs.TripUpdate,
        pattern_id: str,
        edge: int,
        departed_at: float,
        stamp: float,
        first_arrival: float,
    ) -> list[dict[str, Any]]:
        """Future stop timeline: ``[{stop, arr, dep}]`` the client can evaluate."""
        stops = self.patterns.get(pattern_id, {}).get("stops") or []
        last_edge = max(0, len(stops) - 2)
        edge = min(max(edge, 0), last_edge)
        if edge >= last_edge and first_arrival <= stamp + 1:
            # Already at the terminal: there is nothing left to predict.
            return []
        arrival = first_arrival
        rows: list[dict[str, Any]] = []
        while len(rows) < PLAN_STOPS:
            next_index = edge + 1
            if next_index >= len(stops):
                break
            stop_id = stops[next_index][0]
            if rows:
                # The first arrival is fixed by the caller so the position and
                # the timeline agree at `generated_at`; later stops may use the
                # feed's own predictions.
                predicted = self._predicted_arrival(update, stop_id, stamp)
                prior = arrival
                if predicted is not None and prior - 90 <= predicted <= prior + 900:
                    arrival = predicted
            arrival = max(arrival, stamp - 5)
            dwell = self._dwell_seconds(pattern_id, next_index, arrival)
            rows.append({"stop": stop_id, "arr": int(arrival), "dep": int(arrival + dwell)})
            if next_index >= len(stops) - 1:
                break
            edge = next_index
            next_span = self._edge_span(pattern_id, edge)
            arrival = arrival + dwell + self._run_seconds(pattern_id, edge, arrival, next_span)
        return rows

    # -- cycle -------------------------------------------------------------

    def update(self, trip_feeds: dict[str, gtfs.Feed], now: float | None = None) -> dict[str, dict]:
        """Return ``{train_id: position}`` for every train observed this cycle."""
        stamp = time.time() if now is None else now
        positions: dict[str, dict] = {}
        seen: set[str] = set()
        self.unmatched = 0
        self.duplicates = 0
        self.without_vehicle = 0
        self.placeholders = 0
        self.placeholders_off_origin = 0
        self.observed = 0

        for feed in trip_feeds.values():
            for update in feed.trip_updates:
                vehicle = self._vehicle_for(feed, update.trip.trip_id)
                if vehicle is None:
                    self.without_vehicle += 1
                    continue
                self.observed += 1
                if gtfs.is_placeholder(vehicle):
                    self.placeholders += 1
                    first_stop = (
                        update.stop_time_updates[0].stop_id if update.stop_time_updates else None
                    )
                    if vehicle.stop_id != first_stop:
                        self.placeholders_off_origin += 1
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
                anchor = self._anchor(update, vehicle, match, stamp)
                if anchor is None:
                    continue
                if key in positions:
                    self.duplicates += 1
                    continue
                seen.add(key)
                position = self._reconcile(key, update, vehicle, match, anchor, stamp)
                if position is None:
                    continue
                positions[key] = {
                    "pattern": position.pattern,
                    "edge": position.edge,
                    "s": round(position.s, 1),
                    "s_total": round(position.s_total, 1),
                    "v": round(position.v, 1),
                    "confidence": round(position.confidence, 2),
                    "stale": position.stale,
                    "reset": position.reset,
                    "depart_at": int(position.depart_at) if position.depart_at else None,
                    "sigma": round(position.sigma, 0),
                    "next": position.next_stops,
                }

        for key in list(self.states):
            if key not in seen and stamp - self.states[key].last_seen > 4 * STALE_S:
                del self.states[key]
        return positions

    def _reconcile(
        self,
        key: str,
        update: gtfs.TripUpdate,
        vehicle: gtfs.VehiclePosition,
        match: join.Match,
        anchor: tuple[int, float],
        stamp: float,
    ) -> Position | None:
        pattern_id = match.pattern_id
        edge, departed_at = anchor
        stops = self.patterns.get(pattern_id, {}).get("stops") or []
        if not stops:
            return None

        observed_at = self._observation_time(vehicle, stamp)
        confidence = match.confidence
        if vehicle.timestamp and vehicle.timestamp - stamp > FUTURE_SKEW_S:
            confidence *= 0.5
        stale = bool(
            vehicle.timestamp
            and abs(stamp - vehicle.timestamp) > STALE_S
            and vehicle.timestamp < stamp
        )
        if stale:
            confidence *= 0.5

        edge, s, speed, depart_at = self._place(pattern_id, edge, departed_at, stamp)
        span = self._edge_span(pattern_id, edge)
        next_stop = stops[edge + 1][0] if edge + 1 < len(stops) else None
        eta = self._predicted_arrival(update, next_stop, stamp) if next_stop else None
        prior_run = self._run_seconds(pattern_id, edge, stamp, span)
        first_arrival = depart_at + prior_run
        if eta is not None and depart_at + 0.4 * prior_run <= eta <= depart_at + 3.0 * prior_run:
            # The trip's own prediction is a better run time than any prior,
            # but only inside a band where it cannot be a stale hold-over.
            first_arrival = eta
        if stamp > depart_at:
            run = max(1.0, first_arrival - depart_at)
            fraction, normalised = profile(stamp - depart_at, run)
            s = fraction * span
            speed = normalised * span
        else:
            s = 0.0
            speed = 0.0
        s_total = stops[edge][1] + s
        length = self.lengths.get(pattern_id, 0.0)

        previous = self.states.get(key)
        reset = False
        if previous is not None and previous.pattern != pattern_id:
            # Short-turn or reroute: same train, new coordinate space. Anchor
            # without a reset fade; the client can carry the dot across.
            previous = None
        if previous is not None:
            old_edge, old_s, _, _ = self._place(
                previous.pattern, previous.edge, previous.departed_at, stamp
            )
            old_total = (
                self.patterns[previous.pattern]["stops"][old_edge][1] + old_s
            )
            elapsed = max(stamp - previous.last_seen, 0.0)
            # A jump larger than a train could physically cover is a skipped
            # stop or a re-route, not motion to glide through: adopt it and let
            # the client fade the marker.
            if abs(s_total - old_total) > max(RESET_M, MAX_SPEED_MPS * elapsed):
                reset = True
                confidence *= 0.5

        sigma = min(
            500.0,
            6.0 * max(0.0, stamp - observed_at) + 25.0 + (1.0 - confidence) * 80.0,
        )
        confidence = min(max(confidence, 0.0), 1.0)

        self.states[key] = TrainState(
            key=key,
            pattern=pattern_id,
            edge=edge,
            departed_at=depart_at,
            last_seen=stamp,
            observed_at=observed_at,
            confidence=confidence,
            trip_id=update.trip.trip_id,
            status=vehicle.current_status,
        )
        edge_id, local = self._locate(pattern_id, min(s_total, length))
        return Position(
            pattern=pattern_id,
            edge=edge_id,
            s=local,
            s_total=s_total,
            v=speed,
            confidence=confidence,
            stale=stale,
            reset=reset,
            depart_at=depart_at,
            sigma=sigma,
            next_stops=self._plan(update, pattern_id, edge, depart_at, stamp, first_arrival),
        )
