import type { CatalogResult, ParsedSatellite } from './types';

const LOCAL_API_URL =
    import.meta.env.VITE_SATELLITE_API_URL || 'https://thehuis.tail4fbfb1.ts.net/tles.json';

export const CELESTRAK_URL =
    'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

const FETCH_TIMEOUT_MS = 8000;

// TLEs older than this are dropped from live sources: SGP4 error growth makes
// them misleading, and ancient extras (lunar sets, 1960s debris) draw fantasy
// orbits — e.g. subterranean perigees. 30d keeps the full fresh catalog while
// removing the ancient tail (a 14d cutoff would nuke the feed itself, which
// typically lags ~2 weeks).
export const MAX_TLE_AGE_DAYS = 30;

// NORAD catalog ID from TLE line 1, cols 3-7. Once the 5-digit field runs out
// (the catalog passed 99999), IDs are encoded "alpha-5": the first character is
// a letter for the leading digit(s) — A=10, B=11 … Z=35 — so E8493 means
// 148493. Parse both encodings; null if unparsable.
export function parseNoradId(line1: string): number | null {
    const field = line1.slice(2, 7);
    if (!/^[A-Za-z0-9]{5}$/.test(field)) return null;
    const first = field[0];
    if (first >= 'A' && first <= 'Z') {
        const rest = field.slice(1);
        if (!/^\d{4}$/.test(rest)) return null;
        // Space-Track's table: A0000 = 100000, i.e. letter value (A=10) × 10⁴
        // plus the remaining four digits — E8493 = 148493.
        return (first.charCodeAt(0) - 55) * 10000 + parseInt(rest, 10);
    }
    if (!/^\d{5}$/.test(field)) return null;
    return parseInt(field, 10);
}

// Epoch field (cols 19-32: YYDDD.DDDDDDDD) as unix ms, or null if unparsable.
export function tleEpochMs(line1: string): number | null {
    const yy = parseInt(line1.slice(18, 20), 10);
    const dayOfYear = parseFloat(line1.slice(20, 32));
    if (!Number.isFinite(yy) || !Number.isFinite(dayOfYear)) return null;
    const year = yy < 57 ? 2000 + yy : 1900 + yy;
    return Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86400000;
}

// Secret-code naming aside, "how stale is this TLE" is the question: age of the
// line-1 epoch relative to `nowMs` in days, or null without a parsable epoch.
export function epochAgeDays(line1: string, nowMs: number): number | null {
    const epoch = tleEpochMs(line1);
    return epoch === null ? null : (nowMs - epoch) / 86400000;
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
        satellites.push({
            name,
            line1: line1.trimEnd(),
            line2: line2.trimEnd(),
            noradId: parseNoradId(line1)
        });
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
        // Local API returns JSON array of {name, line1, line2, objectType?}
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length > 0) {
            return data.map(
                (s: {
                    name: string;
                    line1: string;
                    line2: string;
                    objectType?: string;
                    category?: string;
                }) => ({
                    name: s.name,
                    line1: s.line1,
                    line2: s.line2,
                    noradId: parseNoradId(s.line1),
                    objectType: s.objectType,
                    category: s.category
                })
            );
        }
        return null;
    } catch {
        return null;
    }
}

// The bundled fallback catalog rides in via Vite's `?raw` loader. It stays a
// dynamic import: bun's test runner can't rewrite the `?raw`/alias module id,
// and loadCatalog only runs in the browser anyway.
async function loadSampleTles(): Promise<string> {
    const mod = await import('$lib/satellites/data/sample-tles.txt?raw');
    return (mod.default ?? '') as string;
}

export async function loadCatalog(): Promise<CatalogResult> {
    // 1. Try local API first
    const local = await fetchLocalApi();
    if (local && local.length > 0) {
        const { fresh, stale } = partitionFresh(local, Date.now());
        if (fresh.length > 0) {
            return {
                satellites: fresh,
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
                    satellites: fresh,
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
    const sample = parseTleText(await loadSampleTles());
    if (sample.length === 0) {
        return { satellites: [], source: 'error', error: 'No satellite data available.' };
    }
    return {
        satellites: sample,
        source: 'sample',
        error: `Local API and CelesTrak unavailable (${fallbackError}); using bundled sample catalog.`
    };
}
