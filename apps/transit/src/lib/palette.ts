/**
 * Official MTA route colours.
 *
 * Route ids occasionally carry a suffix (`6X`, `7X`, `FX`) for a variant service;
 * those share the base route's colour.
 */

const ROUTE_COLORS: Record<string, string> = {
    '1': '#EE352E',
    '2': '#EE352E',
    '3': '#EE352E',
    '4': '#00933C',
    '5': '#00933C',
    '6': '#00933C',
    '7': '#B933AD',
    A: '#0039A6',
    C: '#0039A6',
    E: '#0039A6',
    B: '#FF6319',
    D: '#FF6319',
    F: '#FF6319',
    M: '#FF6319',
    G: '#6CBE45',
    J: '#996633',
    Z: '#996633',
    L: '#A7A9AC',
    N: '#FCCC0A',
    Q: '#FCCC0A',
    R: '#FCCC0A',
    W: '#FCCC0A',
    GS: '#808183',
    FS: '#808183',
    H: '#808183',
    SI: '#1E90FF'
};

const FALLBACK_COLOR = '#cbd5e1';

/**
 * Colour for a route id, or a neutral slate for unknown/absent routes.
 *
 * @param route Route id as it appears in the graph (`1`, `6X`, `SI`, …).
 */
export function routeColor(route: string | null): string {
    if (!route) {
        return FALLBACK_COLOR;
    }

    const key = route.trim().toUpperCase();
    const base = key.endsWith('X') ? key.slice(0, -1) : key;

    return ROUTE_COLORS[base] ?? ROUTE_COLORS[key] ?? FALLBACK_COLOR;
}
