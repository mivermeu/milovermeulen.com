/**
 * URL deep-link parameters for the tracker, kept framework-free so they are
 * trivially unit-testable (the browser glue lives in `url-sync.svelte.ts`).
 *
 * Supported params:
 * - `sat`   — NORAD catalog number; pins/locates that satellite (unknown ids are ignored)
 * - `mode`  — epoch | smoothed | instantaneous (orbital-element set)
 * - `frame` — ecf | eci (reference frame)
 * - `gx`/`gy` — graph axis parameter keys (validated against graph-params)
 *
 * Params equal to the defaults are omitted so shared URLs stay clean.
 */

import type { ElementMode } from '$lib/orbit';
import { isParamKey, type ParamKey } from '$lib/graph-params';

export const ELEMENT_MODES = ['epoch', 'smoothed', 'instantaneous'] as const;
export const REFERENCE_FRAMES = ['ecf', 'eci'] as const;

export interface TrackerUrlParams {
    sat?: number;
    mode?: ElementMode;
    frame?: 'ecf' | 'eci';
    gx?: ParamKey;
    gy?: ParamKey;
}

const ELEMENT_MODE_SET = new Set<string>(ELEMENT_MODES);
const FRAME_SET = new Set<string>(REFERENCE_FRAMES);

export const DEFAULT_URL_PARAMS: Required<Omit<TrackerUrlParams, 'sat'>> = {
    mode: 'smoothed',
    frame: 'ecf',
    gx: 'perigee',
    gy: 'apogee'
};

/** NORAD catalog number from a TLE's first line (cols 3–7), or null if unparsable. */
export function noradIdFromLine1(line1: string): number | null {
    if (line1.length < 7) return null;
    const raw = line1.slice(2, 7).trim();
    // Strict digits only: parseInt would happily accept trailing letters and
    // mis-split garbage lines that happen to start with digits.
    if (!/^\d+$/.test(raw)) return null;
    const id = parseInt(raw, 10);
    return id >= 0 && id < 100000 ? id : null;
}

/** NORAD catalog number of a parsed satellite, or null if unparsable. */
export function noradId(sat: ParsedSatelliteRef): number | null {
    return noradIdFromLine1(sat.line1);
}

interface ParsedSatelliteRef {
    line1: string;
}

/**
 * Index the catalog by NORAD id. Returns a Map even for unknown ids (missing =
 * not present). The catalog is immutable once loaded, so callers that want to
 * scan it should pass the (already read) array value in, untracked.
 */
export function catalogByNorad(satellites: ReadonlyArray<{ line1: string }>): Map<number, number> {
    const map = new Map<number, number>();
    for (let i = 0; i < satellites.length; i++) {
        const id = noradId(satellites[i]);
        if (id === null || map.has(id)) continue;
        map.set(id, i);
    }
    return map;
}

/**
 * Parse a query string (or full search string). Every value is validated
 * against its enum; unknown/invalid values are silently ignored.
 */
export function parseTrackerUrlParams(search: string): TrackerUrlParams {
    const out: TrackerUrlParams = {};
    let params: URLSearchParams;
    try {
        params = new URLSearchParams(search);
    } catch {
        return out;
    }

    const satRaw = params.get('sat');
    if (satRaw) {
        const sat = Number(satRaw);
        if (Number.isInteger(sat) && sat >= 0 && sat < 100000) out.sat = sat;
    }

    const modeRaw = params.get('mode');
    if (modeRaw && ELEMENT_MODE_SET.has(modeRaw)) out.mode = modeRaw as ElementMode;

    const frameRaw = params.get('frame');
    if (frameRaw && FRAME_SET.has(frameRaw)) out.frame = frameRaw as 'ecf' | 'eci';

    const gxRaw = params.get('gx');
    if (gxRaw && isParamKey(gxRaw)) out.gx = gxRaw;

    const gyRaw = params.get('gy');
    if (gyRaw && isParamKey(gyRaw)) out.gy = gyRaw;

    return out;
}

/**
 * Encode the current params as a query string, dropping everything equal to the
 * defaults (`sat` is dropped when unset). Round-trips with
 * `parseTrackerUrlParams`.
 */
export function encodeTrackerUrlParams(params: TrackerUrlParams): string {
    const search = new URLSearchParams();
    if (params.sat !== undefined) search.set('sat', String(params.sat));
    if (params.mode !== undefined && params.mode !== DEFAULT_URL_PARAMS.mode)
        search.set('mode', params.mode);
    if (params.frame !== undefined && params.frame !== DEFAULT_URL_PARAMS.frame)
        search.set('frame', params.frame);
    if (params.gx !== undefined && params.gx !== DEFAULT_URL_PARAMS.gx) search.set('gx', params.gx);
    if (params.gy !== undefined && params.gy !== DEFAULT_URL_PARAMS.gy) search.set('gy', params.gy);
    return search.toString();
}
