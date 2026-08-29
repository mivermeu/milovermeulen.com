import sampleTles from '$lib/satellites/data/sample-tles.txt?raw';
import type { CatalogResult, ParsedSatellite } from './types';

export const CELESTRAK_URL =
    'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

const FETCH_TIMEOUT_MS = 8000;
// Covers the full active CelesTrak catalog (~16k) with headroom. Rendering is one
// GPU draw call for all dots, so this is cheap; only worker propagation scales with it.
const MAX_SATELLITES = 20000;

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

export async function loadCatalog(): Promise<CatalogResult> {
    let liveError: string | undefined;
    try {
        const text = await fetchWithTimeout(CELESTRAK_URL, FETCH_TIMEOUT_MS);
        const live = parseTleText(text).slice(0, MAX_SATELLITES);
        if (live.length > 0) {
            return { satellites: live, source: 'celestrak' };
        }
        liveError = 'CelesTrak returned no TLE data.';
    } catch (error) {
        liveError = error instanceof Error ? error.message : String(error);
    }

    const sample = parseTleText(sampleTles).slice(0, MAX_SATELLITES);
    if (sample.length === 0) {
        return { satellites: [], source: 'error', error: 'No satellite data available.' };
    }
    return {
        satellites: sample,
        source: 'sample',
        error: `Live CelesTrak fetch failed (${liveError}); using bundled sample catalog.`
    };
}
