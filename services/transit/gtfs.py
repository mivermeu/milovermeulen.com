"""Minimal GTFS-realtime decoder — standard library only.

The transit service deliberately carries no protobuf dependency: it needs six
messages out of the spec plus the NYCT extensions, all of which are plain
length-delimited fields. A hand-written wire reader keeps deployment to
``python3 -m services.transit.poller`` with nothing installed, and lets us read
the NYCT extension (field 1001) that ``gtfs-realtime-bindings`` does not ship.

The decoder is strict on purpose: a truncated or non-protobuf payload raises
``GtfsRtError`` so the poller can quarantine it instead of guessing. Field
numbers below are pinned to gtfs-realtime.proto and verified by the fixture
tests against captured live feeds.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

# Wire types (protobuf encoding spec).
_WIRE_VARINT = 0
_WIRE_64 = 1
_WIRE_LEN = 2
_WIRE_32 = 5

# Field numbers, named so the parsers below read as protocol rather than magic.
_HEADER = 1
_ENTITY = 2

_HEADER_VERSION = 1
_HEADER_INCREMENTALITY = 2
_HEADER_TIMESTAMP = 3

_ENTITY_ID = 1
_ENTITY_DELETED = 2
_ENTITY_TRIP_UPDATE = 3
_ENTITY_VEHICLE = 4
_ENTITY_ALERT = 5

_TRIP_UPDATE_TRIP = 1
_TRIP_UPDATE_STOP_TIME = 2
_TRIP_UPDATE_TIMESTAMP = 4
_TRIP_UPDATE_DELAY = 5

_STOP_TIME_SEQUENCE = 1
_STOP_TIME_ARRIVAL = 2
_STOP_TIME_DEPARTURE = 3
_STOP_TIME_STOP_ID = 4

_EVENT_DELAY = 1
_EVENT_TIME = 2

# TripDescriptor: note that route_id and direction_id are 5 and 6, not 2 and 3.
_TRIP_ID = 1
_TRIP_START_DATE = 3
_TRIP_ROUTE_ID = 5
_TRIP_DIRECTION_ID = 6

_VEHICLE_TRIP = 1
_VEHICLE_CURRENT_SEQUENCE = 3
_VEHICLE_CURRENT_STATUS = 4
_VEHICLE_TIMESTAMP = 5
_VEHICLE_STOP_ID = 7
_VEHICLE_DESCRIPTOR = 8
_VEHICLE_DESCRIPTOR_ID = 1
_VEHICLE_DESCRIPTOR_LABEL = 2

_ALERT_INFORMED_ENTITY = 5
_ALERT_CAUSE = 6
_ALERT_EFFECT = 7
_ALERT_HEADER_TEXT = 10
_ALERT_DESCRIPTION_TEXT = 11
_SELECTOR_ROUTE_ID = 2
_SELECTOR_STOP_ID = 5

_TRANSLATION = 1
_TRANSLATION_TEXT = 1
_TRANSLATION_LANGUAGE = 2

# NYCT extensions (nyct.proto), absent from the public bindings.
_NYCT_TRIP_DESCRIPTOR = 1001
_NYCT_TRAIN_ID = 1
_NYCT_DIRECTION = 3
_NYCT_STOP_TIME_UPDATE = 1001
_NYCT_SCHEDULED_TRACK = 1
_NYCT_ACTUAL_TRACK = 2

Fields = list[tuple[int, int, Any]]


class GtfsRtError(ValueError):
    """Raised when a payload is not decodable GTFS-realtime."""


@dataclass(slots=True)
class StopTimeEvent:
    delay: int | None = None
    time: int | None = None


@dataclass(slots=True)
class StopTimeUpdate:
    stop_sequence: int | None = None
    stop_id: str | None = None
    arrival: StopTimeEvent | None = None
    departure: StopTimeEvent | None = None
    scheduled_track: str | None = None
    actual_track: str | None = None


@dataclass(slots=True)
class TripDescriptor:
    trip_id: str | None = None
    route_id: str | None = None
    direction_id: int | None = None
    start_date: str | None = None
    train_id: str | None = None
    nyct_direction: int | None = None


@dataclass(slots=True)
class TripUpdate:
    trip: TripDescriptor
    stop_time_updates: list[StopTimeUpdate] = field(default_factory=list)
    timestamp: int | None = None
    delay: int | None = None


@dataclass(slots=True)
class VehiclePosition:
    trip_id: str | None = None
    stop_id: str | None = None
    current_stop_sequence: int | None = None
    current_status: int | None = None
    timestamp: int | None = None
    vehicle_id: str | None = None
    label: str | None = None


@dataclass(slots=True)
class Alert:
    id: str | None = None
    effect: int | None = None
    cause: int | None = None
    header: str | None = None
    description: str | None = None
    route_ids: list[str] = field(default_factory=list)
    stop_ids: list[str] = field(default_factory=list)


@dataclass(slots=True)
class Feed:
    version: str | None = None
    incrementality: int | None = None
    header_ts: int | None = None
    trip_updates: list[TripUpdate] = field(default_factory=list)
    vehicles: list[VehiclePosition] = field(default_factory=list)
    alerts: list[Alert] = field(default_factory=list)


def _read_varint(buf: bytes, index: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while True:
        if index >= len(buf):
            raise GtfsRtError("truncated varint")
        byte = buf[index]
        index += 1
        value |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return value, index
        shift += 7
        if shift > 63:
            raise GtfsRtError("varint too long")


def iter_fields(buf: bytes) -> Iterator[tuple[int, int, Any]]:
    """Yield ``(field_number, wire_type, value)`` for one encoded message."""
    index = 0
    size = len(buf)
    while index < size:
        key, index = _read_varint(buf, index)
        number, wire = key >> 3, key & 7
        if number == 0:
            raise GtfsRtError("invalid field number 0")
        if wire == _WIRE_VARINT:
            value, index = _read_varint(buf, index)
        elif wire == _WIRE_64:
            if index + 8 > size:
                raise GtfsRtError("truncated fixed64 field")
            value = buf[index : index + 8]
            index += 8
        elif wire == _WIRE_LEN:
            length, index = _read_varint(buf, index)
            if index + length > size:
                raise GtfsRtError("truncated length-delimited field")
            value = buf[index : index + length]
            index += length
        elif wire == _WIRE_32:
            if index + 4 > size:
                raise GtfsRtError("truncated fixed32 field")
            value = buf[index : index + 4]
            index += 4
        else:
            raise GtfsRtError(f"unsupported wire type {wire}")
        yield number, wire, value


def _fields(buf: bytes) -> Fields:
    return list(iter_fields(buf))


def _all(fields: Fields, number: int, wire: int = _WIRE_LEN) -> list[Any]:
    return [
        value
        for field_number, field_wire, value in fields
        if field_number == number and field_wire == wire
    ]


def _first(fields: Fields, number: int, wire: int = _WIRE_LEN) -> Any | None:
    for field_number, field_wire, value in fields:
        if field_number == number and field_wire == wire:
            return value
    return None


def _text(fields: Fields, number: int) -> str | None:
    raw = _first(fields, number)
    return None if raw is None else raw.decode("utf-8", "replace")


def _integer(fields: Fields, number: int) -> int | None:
    return _first(fields, number, _WIRE_VARINT)


def _signed(fields: Fields, number: int) -> int | None:
    """Read an int32 field, undoing protobuf's sign extension.

    proto2 encodes a negative int32 as a ten-byte varint sign-extended to 64
    bits, so the raw varint is ~2**64 for a value like -138. Accept the
    non-canonical 32-bit form too.
    """
    value = _first(fields, number, _WIRE_VARINT)
    if value is None:
        return None
    if value >= 1 << 63:
        return value - (1 << 64)
    if value >= 1 << 31:
        return value - (1 << 32)
    return value


def _message(fields: Fields, number: int) -> Fields | None:
    raw = _first(fields, number)
    return None if raw is None else _fields(raw)


def _parse_event(fields: Fields) -> StopTimeEvent:
    return StopTimeEvent(delay=_signed(fields, _EVENT_DELAY), time=_integer(fields, _EVENT_TIME))


def _parse_stop_time_update(fields: Fields) -> StopTimeUpdate:
    update = StopTimeUpdate(
        stop_sequence=_integer(fields, _STOP_TIME_SEQUENCE),
        stop_id=_text(fields, _STOP_TIME_STOP_ID),
    )
    arrival = _message(fields, _STOP_TIME_ARRIVAL)
    if arrival is not None:
        update.arrival = _parse_event(arrival)
    departure = _message(fields, _STOP_TIME_DEPARTURE)
    if departure is not None:
        update.departure = _parse_event(departure)
    nyct = _message(fields, _NYCT_STOP_TIME_UPDATE)
    if nyct is not None:
        update.scheduled_track = _text(nyct, _NYCT_SCHEDULED_TRACK)
        update.actual_track = _text(nyct, _NYCT_ACTUAL_TRACK)
    return update


def _parse_trip_descriptor(fields: Fields) -> TripDescriptor:
    trip = TripDescriptor(
        trip_id=_text(fields, _TRIP_ID),
        route_id=_text(fields, _TRIP_ROUTE_ID),
        direction_id=_integer(fields, _TRIP_DIRECTION_ID),
        start_date=_text(fields, _TRIP_START_DATE),
    )
    nyct = _message(fields, _NYCT_TRIP_DESCRIPTOR)
    if nyct is not None:
        trip.train_id = _text(nyct, _NYCT_TRAIN_ID)
        trip.nyct_direction = _integer(nyct, _NYCT_DIRECTION)
    return trip


def _parse_trip_update(fields: Fields) -> TripUpdate:
    trip_fields = _message(fields, _TRIP_UPDATE_TRIP)
    update = TripUpdate(
        trip=_parse_trip_descriptor(trip_fields or []),
        timestamp=_integer(fields, _TRIP_UPDATE_TIMESTAMP),
        delay=_signed(fields, _TRIP_UPDATE_DELAY),
    )
    for raw in _all(fields, _TRIP_UPDATE_STOP_TIME):
        update.stop_time_updates.append(_parse_stop_time_update(_fields(raw)))
    return update


def _parse_vehicle(fields: Fields) -> VehiclePosition:
    trip_fields = _message(fields, _VEHICLE_TRIP)
    vehicle = VehiclePosition(
        trip_id=_text(trip_fields or [], _TRIP_ID),
        stop_id=_text(fields, _VEHICLE_STOP_ID),
        current_stop_sequence=_integer(fields, _VEHICLE_CURRENT_SEQUENCE),
        current_status=_integer(fields, _VEHICLE_CURRENT_STATUS),
        timestamp=_integer(fields, _VEHICLE_TIMESTAMP),
    )
    # current_status is proto2-optional with a default of IN_TRANSIT_TO (2), so an
    # absent field still means "between stations", not "unknown".
    if vehicle.current_status is None:
        vehicle.current_status = 2
    descriptor = _message(fields, _VEHICLE_DESCRIPTOR)
    if descriptor is not None:
        vehicle.vehicle_id = _text(descriptor, _VEHICLE_DESCRIPTOR_ID)
        vehicle.label = _text(descriptor, _VEHICLE_DESCRIPTOR_LABEL)
    return vehicle


def _translated_text(fields: Fields, number: int) -> str | None:
    container = _message(fields, number)
    if container is None:
        return None
    translations = [_fields(raw) for raw in _all(container, _TRANSLATION)]
    for translation in translations:
        language = _text(translation, _TRANSLATION_LANGUAGE) or ""
        if language.startswith("en"):
            text = _text(translation, _TRANSLATION_TEXT)
            if text:
                return text
    for translation in translations:
        text = _text(translation, _TRANSLATION_TEXT)
        if text:
            return text
    return None


def _parse_alert(entity_id: str | None, fields: Fields) -> Alert:
    alert = Alert(
        id=entity_id,
        effect=_integer(fields, _ALERT_EFFECT),
        cause=_integer(fields, _ALERT_CAUSE),
        header=_translated_text(fields, _ALERT_HEADER_TEXT),
        description=_translated_text(fields, _ALERT_DESCRIPTION_TEXT),
    )
    for raw in _all(fields, _ALERT_INFORMED_ENTITY):
        selector = _fields(raw)
        route_id = _text(selector, _SELECTOR_ROUTE_ID)
        stop_id = _text(selector, _SELECTOR_STOP_ID)
        if route_id:
            alert.route_ids.append(route_id)
        if stop_id:
            alert.stop_ids.append(stop_id)
    return alert


def parse_feed(payload: bytes) -> Feed:
    """Decode one ``FeedMessage``. Raises ``GtfsRtError`` on malformed input."""
    if not payload:
        raise GtfsRtError("empty payload")
    root = _fields(payload)
    header = _message(root, _HEADER)
    if header is None:
        raise GtfsRtError("missing feed header")
    feed = Feed(
        version=_text(header, _HEADER_VERSION),
        incrementality=_integer(header, _HEADER_INCREMENTALITY),
        header_ts=_integer(header, _HEADER_TIMESTAMP),
    )
    for raw in _all(root, _ENTITY):
        entity = _fields(raw)
        if _integer(entity, _ENTITY_DELETED):
            continue
        entity_id = _text(entity, _ENTITY_ID)
        if (trip := _message(entity, _ENTITY_TRIP_UPDATE)) is not None:
            feed.trip_updates.append(_parse_trip_update(trip))
        elif (vehicle := _message(entity, _ENTITY_VEHICLE)) is not None:
            feed.vehicles.append(_parse_vehicle(vehicle))
        elif (alert := _message(entity, _ENTITY_ALERT)) is not None:
            feed.alerts.append(_parse_alert(entity_id, alert))
    return feed
