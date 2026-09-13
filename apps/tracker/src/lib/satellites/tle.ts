import sampleTles from '$lib/satellites/data/sample-tles.txt?raw';
import type { CatalogResult, ParsedSatellite } from './types';

const LOCAL_API_URL =
    import.meta.env.VITE_SATELLITE_API_URL || 'https://thehuis.tail4fbfb1.ts.net/tles.json';

export const CELESTRAK_URL =
    'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

const FETCH_TIMEOUT_MS = 8000;
// Covers the full active CelesTrak catalog (~16k) with headroom. Rendering is one
// GPU draw call for all dots, so this is cheap; only worker propagation scales with it.
const MAX_SATELLITES = 20000;

// TLEs older than this are dropped from live sources: SGP4 error growth makes
// them misleading, and ancient extras (lunar sets, 1960s debris) draw fantasy
// orbits — e.g. subterranean perigees. 30d keeps the full fresh catalog while
// removing the ancient tail (a 14d cutoff would nuke the feed itself, which
// typically lags ~2 weeks).
export const MAX_TLE_AGE_DAYS = 30;

// Epoch field (cols 19-32: YYDDD.DDDDDDDD) as unix ms, or null if unparsable.
export function tleEpochMs(line1: string): number | null {
    const yy = parseInt(line1.slice(18, 20), 10);
    const dayOfYear = parseFloat(line1.slice(20, 32));
    if (!Number.isFinite(yy) || !Number.isFinite(dayOfYear)) return null;
    const year = yy < 57 ? 2000 + yy : 1900 + yy;
    return Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86400000;
}

export function partitionFresh(
    sats: ParsedSatellite[],
    nowMs: number
): { fresh: ParsedSatellite[]; stale: number } {
    const fresh = sats.filter((s) => {
        const epoch = tleEpochMs(s.line1);
        return epoch !== null && nowMs - epoch <= MAX_TLE_AGE_DAYS * 86400000;
    });
    return { fresh, stale: sats.length - fresh.length };
}

export function parseTleText(text: string): ParsedSatellite[] {
    const lines = text.split(/\r?\n/);
    const satellites: ParsedSatellite[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line1 = lines[i];
        if (!line1.startsWith('1 ')) continue;
        const line2 = lines[i + 1] ?? '';
        if (!line2.startsWith('2 ')) continue;
        let name = '';
        for (let j = i - 1; j >= 0; j--) {
            const candidate = lines[j].trim();
            if (
                candidate.length > 0 &&
                !candidate.startsWith('1 ') &&
                !candidate.startsWith('2 ')
            ) {
                name = candidate;
                break;
            }
        }
        satellites.push({ name, line1: line1.trimEnd(), line2: line2.trimEnd() });
        i++;
    }
    return satellites;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } finally {
        clearTimeout(timer);
    }
}

async function fetchLocalApi(): Promise<ParsedSatellite[] | null> {
    try {
        const text = await fetchWithTimeout(LOCAL_API_URL, FETCH_TIMEOUT_MS);
        // Local API returns JSON array of {name, line1, line2}
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length > 0) {
            return data.map((s: { name: string; line1: string; line2: string }) => ({
                name: s.name,
                line1: s.line1,
                line2: s.line2
            }));
        }
        return null;
    } catch {
        return null;
    }
}

export async function loadCatalog(): Promise<CatalogResult> {
    // 1. Try local API first
    const local = await fetchLocalApi();
    if (local && local.length > 0) {
        const { fresh, stale } = partitionFresh(local, Date.now());
        if (fresh.length > 0) {
            return {
                satellites: fresh.slice(0, MAX_SATELLITES),
                source: 'local-api',
                staleHidden: stale
            };
        }
    }

    // 2. Fall back to CelesTrak
    let fallbackError: string | undefined;
    try {
        const text = await fetchWithTimeout(CELESTRAK_URL, FETCH_TIMEOUT_MS);
        const parsed = parseTleText(text);
        if (parsed.length > 0) {
            const { fresh, stale } = partitionFresh(parsed, Date.now());
            if (fresh.length > 0) {
                return {
                    satellites: fresh.slice(0, MAX_SATELLITES),
                    source: 'celestrak',
                    staleHidden: stale
                };
            }
            fallbackError = 'CelesTrak data is all stale.';
        } else {
            fallbackError = 'CelesTrak returned no TLE data.';
        }
    } catch (error) {
        fallbackError = error instanceof Error ? error.message : String(error);
    }

    // 3. Fall back to bundled sample (synthetic, zero-drag — exempt from aging).
    const sample = parseTleText(sampleTles).slice(0, MAX_SATELLITES);
    if (sample.length === 0) {
        return { satellites: [], source: 'error', error: 'No satellite data available.' };
    }
    return {
        satellites: sample,
        source: 'sample',
        error: `Local API and CelesTrak unavailable (${fallbackError}); using bundled sample catalog.`
    };
}
