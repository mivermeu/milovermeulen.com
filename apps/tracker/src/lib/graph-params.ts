import type { OrbitalElements } from '$lib/orbit';

/**
 * Graphable quantities shared by the orbital graph and the URL deep-link
 * encoding (`gx`/`gy`). Kept out of the component so other modules can validate
 * axis keys without importing three.js-dependent Svelte code.
 */

export type BaseParamKey = keyof OrbitalElements | 'u';
export type DerivedParamKey = 'perigee' | 'apogee' | 'period' | 'nu';
export type ParamKey = BaseParamKey | DerivedParamKey;

export interface ParamMeta {
    key: ParamKey;
    /** Precise axis name. */
    label: string;
    /** Compact symbol shown in the pickers. */
    short: string;
    /** Plain-language explanation for the tooltip. */
    desc: string;
}

// The six fundamental Keplerian elements.
export const FUNDAMENTAL: ParamMeta[] = [
    {
        key: 'a',
        label: 'Semi-major axis (km)',
        short: 'a',
        desc: "The orbit's size — roughly its average distance from Earth's centre."
    },
    {
        key: 'e',
        label: 'Eccentricity',
        short: 'e',
        desc: "The orbit's shape: 0 is a perfect circle, higher values are more stretched."
    },
    {
        key: 'i',
        label: 'Inclination (°)',
        short: 'i',
        desc: 'How far the orbit is tilted from the equator (0° means it never leaves it).'
    },
    {
        key: 'raan',
        label: 'RAAN (°)',
        short: 'Ω',
        desc: 'Where the orbit crosses the equator heading north.'
    },
    {
        key: 'argp',
        label: 'Arg. of periapsis (°)',
        short: 'ω',
        desc: "Where the orbit's closest point to Earth sits within the orbit."
    },
    {
        key: 'm',
        label: 'Mean anomaly (°)',
        short: 'M',
        desc: 'Where the satellite is along its orbit, measured from that closest point.'
    }
];

// Derived quantities, shown after a separator in the pickers. All are pure
// functions of the live element set, so they work in every mode.
export const DERIVED: ParamMeta[] = [
    {
        key: 'u',
        label: 'Anomaly past asc. node (°)',
        short: 'u',
        desc: 'The angle from the equator crossing to the satellite; it advances as the satellite moves.'
    },
    {
        key: 'perigee',
        label: 'Perigee altitude (km)',
        short: 'peri',
        desc: 'How low the orbit gets — its closest approach to the surface.'
    },
    {
        key: 'apogee',
        label: 'Apogee altitude (km)',
        short: 'apo',
        desc: 'How high the orbit gets — its farthest point from the surface.'
    },
    {
        key: 'period',
        label: 'Orbital period (min)',
        short: 'T',
        desc: 'How long one full orbit takes.'
    },
    {
        key: 'nu',
        label: 'True anomaly (°)',
        short: 'ν',
        desc: "The satellite's actual angle from perigee — its real position along the orbit."
    }
];

export const ALL_PARAMS: ParamMeta[] = [...FUNDAMENTAL, ...DERIVED];
export const ALL_PARAM_KEYS: readonly ParamKey[] = ALL_PARAMS.map((p) => p.key);

const PARAM_KEYS = new Set<string>(ALL_PARAM_KEYS);

/** True when `key` is a valid graph axis parameter. */
export function isParamKey(key: string): key is ParamKey {
    return PARAM_KEYS.has(key);
}

export function paramMeta(key: ParamKey): ParamMeta {
    return ALL_PARAMS.find((p) => p.key === key) ?? ALL_PARAMS[0];
}

export const EARTH_RADIUS_KM = 6371;
// Log axes clamp to this floor so altitude ~0 (or negative, for decaying
// orbits) doesn't blow up log10; it never affects `a` or period.
export const LOG_FLOOR = 1;
export const LOG_PARAMS = new Set<ParamKey>(['a', 'period', 'perigee', 'apogee']);

export function isLogParam(key: ParamKey): boolean {
    return LOG_PARAMS.has(key);
}

// Natural bounds for parameters that have them; axes are clamped to these so
// e.g. Ω / ω / M / u never show a tick past 360°.
export const LIMITS: Partial<Record<ParamKey, [number, number]>> = {
    e: [0, 1],
    i: [0, 180],
    raan: [0, 360],
    argp: [0, 360],
    m: [0, 360],
    u: [0, 360],
    nu: [0, 360]
};
