"""Minimal protobuf encoder for synthetic test payloads.

Only used to build cases the captured fixtures do not happen to contain (negative
delays, omitted optional fields, differential feeds). Real fixtures remain the
primary evidence for the decoder.
"""

from __future__ import annotations


def varint(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        out.append(byte | (0x80 if value else 0))
        if not value:
            return bytes(out)


def ld(number: int, payload: bytes) -> bytes:
    """Encode a length-delimited (wire type 2) field."""
    return varint((number << 3) | 2) + varint(len(payload)) + payload


def vi(number: int, value: int) -> bytes:
    """Encode a varint (wire type 0) field."""
    return varint((number << 3) | 0) + varint(value)


def feed(
    entities: list[bytes],
    incrementality: int | None = None,
    version: bytes = b"2.0",
) -> bytes:
    """Encode a FeedMessage with a header and the given entities."""
    header = ld(1, version)
    if incrementality is not None:
        header += vi(2, incrementality)
    header += vi(3, 1792978330)
    return ld(1, header) + b"".join(ld(2, entity) for entity in entities)
