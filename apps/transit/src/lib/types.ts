/**
 * Wire formats served by `services/transit`, plus the client-side shapes built
 * from them.
 *
 * Units: distances are metres, times are unix seconds, speeds are m/s.
 * Coordinates are WGS84; the binary shape buffer is lat/lon pairs, while
 * MapLibre wants [lng, lat] — convert at the render boundary, not here.
 */

export type VehicleStatus = 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO';

export interface NextStop {
    stop: string | null;
    arr: number | null;
    dep: number | null;
}

export interface SnapshotTrain {
    id: string;
    trip: string | null;
    route: string | null;
    /** 'N' | 'S' | 'E' | 'W', derived server-side. */
    dir: string | null;
    start_date: string | null;
    status: VehicleStatus | null;
    stop: string | null;
    seq: number | null;
    vehicle_ts: number | null;
    next: NextStop[];
    /** Null when the trip could not be matched to a static pattern. */
    pattern: string | null;
    /** `<pattern>:<index>:<fromStop>><toStop>`. */
    edge: string | null;
    /** Metres from the start of the current edge. */
    s: number | null;
    /** Metres from the start of the pattern. */
    s_total: number | null;
    v: number | null;
    confidence: number;
    stale: boolean;
    /** Unix seconds when the train leaves the current edge's start stop. */
    depart_at?: number | null;
    /** Metres of one-sigma position uncertainty, from observation age. */
    sigma?: number | null;
    /** Recent server-side positions: [unix time, s_total, speed]. */
    path?: [number, number, number][];
    /** The server re-anchored this train; fade it rather than animate a jump. */
    reset: boolean;
    /** No position claim yet: the train has not started service. Absent on older snapshots. */
    pre?: boolean;
}

export interface FeedHealth {
    ok: boolean;
    status: number | null;
    age_s: number | null;
    trips: number;
    vehicles: number;
    alerts: number;
    error: string | null;
}

export interface TransitAlert {
    id: string | null;
    effect: number | null;
    cause: number | null;
    header: string | null;
    routes: string[];
    stops: string[];
}

/** One recent run of a pattern, resampled onto a fixed grid. */
export interface HistoryRun {
    /** Unix start of the run. */
    start: number;
    /** Local hour in New York at the start. */
    h: number;
    /** 0 = weekday, 1 = weekend. */
    w: 0 | 1;
    /** Seconds between samples. */
    dt: number;
    /** Distance along the pattern in metres at each sample. */
    s: number[];
}

export interface PatternHistory {
    v: number;
    pattern: string;
    graph?: string;
    built_at?: number;
    /** Per-edge [p10, p50, p90] run seconds, aligned with the pattern edges. */
    edges?: Partial<Record<'all' | 'weekday' | 'weekend', (number[] | null)[]>>;
    /** Median dwell seconds at each stop. */
    dwells?: number[];
    runs?: HistoryRun[];
}

export interface Snapshot {
    v: number;
    generated_at: number;
    header_ts: number | null;
    /** Hash of the graph these positions were computed against. */
    graph: string | null;
    feeds: Record<string, FeedHealth>;
    scheduled_trips: number;
    /** Trains that have not started service yet. Absent on older snapshots. */
    predeparture?: number;
    estimated: number;
    trains: SnapshotTrain[];
    alerts: TransitAlert[];
}

export interface GraphManifest {
    v: number;
    hash: string;
    graph: string;
    shapes: string;
    built_at: number;
    feed_version: string | null;
    patterns: number;
    shapes_count: number;
}

export interface GraphShape {
    id: string;
    /** Float index into the shape buffer (multiply by 4 for bytes). */
    offset: number;
    /** Number of lat/lon points. */
    count: number;
    length_m: number;
}

/** A stop and its distance from the start of the pattern's shape. */
export type PatternStop = [stop: string, dist: number];

export interface GraphPattern {
    id: string;
    route: string;
    dir: string;
    shape: string;
    length_m: number;
    stops: PatternStop[];
}

export interface Station {
    id: string;
    name: string;
    lat: number;
    lon: number;
}

export interface Platform {
    id: string;
    station: string;
    name: string;
    lat: number;
    lon: number;
    dir: string;
}

export interface Graph {
    v: number;
    built_at: number;
    feed_version: string | null;
    stations: Station[];
    platforms: Platform[];
    shapes: GraphShape[];
    patterns: GraphPattern[];
}

/** A pattern plus its decoded geometry, ready for the sim and the renderer. */
export interface PatternGeometry {
    id: string;
    route: string;
    dir: string;
    length: number;
    /** Ordered stops with distance from the shape start. */
    stops: { stop: string; dist: number }[];
    /** Lat/lon pairs for the whole pattern shape. */
    line: Float32Array;
    /** Metres at each line point, so an arbitrary `s` can be interpolated. */
    cumulative: Float32Array;
}

/** Client-side motion state for one train. */
export interface TrainMotion {
    id: string;
    pattern: string;
    /** Index of the current edge within the pattern's stop list. */
    edge: number;
    /** Metres from the start of the current edge. */
    s: number;
    /** Metres from the start of the pattern. */
    sTotal: number;
    v: number;
    confidence: number;
    stale: boolean;
    reset: boolean;
    route: string | null;
    dir: string | null;
    status: VehicleStatus | null;
    stop: string | null;
    next: NextStop[];
    /** Unix seconds when the train leaves the current edge's start stop. */
    departAt: number | null;
    /** Metres of one-sigma position uncertainty. */
    sigma: number;
    /** Render opacity, ramped from 0 after a reset. */
    fade: number;
    /** Recent positions carried by the snapshot, for the observed chart line. */
    path: { t: number; s: number; v: number }[];
    /** Snapshot time this motion was derived from. */
    observedAt: number;
}

/** A positioned train, ready to hand to the renderer. */
export interface TrainPosition {
    id: string;
    lng: number;
    lat: number;
    route: string | null;
    routeColor: string;
    stale: boolean;
    reset: boolean;
    confidence: number;
    /** False when the trip had no pattern match. */
    positioned: boolean;
    /** Highlighted by the inspector. */
    selected?: boolean;
    /** Waiting at its origin; drawn as a hollow marker. */
    queued?: boolean;
    /** Render opacity, 0..1. Defaults to 1 when absent. */
    opacity?: number;
}
