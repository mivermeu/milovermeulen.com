"""Synthetic static GTFS used by the graph and static-feed tests.

A four-stop straight line is enough to exercise projection, monotonic ordering
and serialisation without committing a 20 MB feed.
"""

from __future__ import annotations

import zipfile
from pathlib import Path

STOPS = """stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station
T1,T One,40.0000,-73.0000,1,
T2,T Two,40.0010,-73.0000,1,
T3,T Three,40.0020,-73.0000,1,
T4,T Four,40.0030,-73.0000,1,
T1N,T One,40.0000,-73.0000,0,T1
T1S,T One,40.0000,-73.0000,0,T1
T2N,T Two,40.0010,-73.0000,0,T2
T2S,T Two,40.0010,-73.0000,0,T2
T3N,T Three,40.0020,-73.0000,0,T3
T3S,T Three,40.0020,-73.0000,0,T3
T4N,T Four,40.0030,-73.0000,0,T4
T4S,T Four,40.0030,-73.0000,0,T4
"""

SHAPES = """shape_id,shape_pt_sequence,shape_pt_lat,shape_pt_lon
SH-N,1,40.0000,-73.0000
SH-N,2,40.0010,-73.0000
SH-N,3,40.0020,-73.0000
SH-N,4,40.0030,-73.0000
SH-S,1,40.0030,-73.0000
SH-S,2,40.0020,-73.0000
SH-S,3,40.0010,-73.0000
SH-S,4,40.0000,-73.0000
"""

TRIPS = """route_id,trip_id,service_id,trip_headsign,direction_id,shape_id
T,TRIP-N,WD,T Four,0,SH-N
T,TRIP-S,WD,T One,1,SH-S
"""

STOP_TIMES = """trip_id,stop_id,arrival_time,departure_time,stop_sequence
TRIP-N,T1N,08:00:00,08:00:00,1
TRIP-N,T2N,08:02:00,08:02:00,2
TRIP-N,T3N,08:04:00,08:04:00,3
TRIP-N,T4N,08:06:00,08:06:00,4
TRIP-S,T4S,08:10:00,08:10:00,1
TRIP-S,T3S,08:12:00,08:12:00,2
TRIP-S,T2S,08:14:00,08:14:00,3
TRIP-S,T1S,08:16:00,08:16:00,4
"""

ROUTES = """route_id,route_short_name,route_long_name,route_type
T,T,Test Line,1
"""


def write_gtfs(directory: Path, end_date: str = "20991231") -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "gtfs-test.zip"
    feed_info = (
        "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,"
        "feed_end_date,feed_version\n"
        f"Test,https://example.com,EN,20260101,{end_date},TEST-1\n"
    )
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("stops.txt", STOPS)
        archive.writestr("shapes.txt", SHAPES)
        archive.writestr("trips.txt", TRIPS)
        archive.writestr("stop_times.txt", STOP_TIMES)
        archive.writestr("routes.txt", ROUTES)
        archive.writestr("feed_info.txt", feed_info)
    return path
