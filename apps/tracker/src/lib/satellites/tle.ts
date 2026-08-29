import sampleTles from '$lib/satellites/data/sample-tles.txt?raw';
import type { CatalogResult, ParsedSatellite } from './types';

const LOCAL_API_URL = import.meta.env.VITE_SATELLITE_API_URL || 'http://localhost:8080/tles.json';
const LOCAL_API_KEY = import.meta.env.VITE_SATELLITE_API_KEY || '';

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

async function fetchWithTimeout(
    url: string,
    timeoutMs: number,
    headers?: Record<string, string>
): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal, headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } finally {
        clearTimeout(timer);
    }
}

async function fetchLocalApi(): Promise<ParsedSatellite[] | null> {
    if (!LOCAL_API_KEY) return null;
    try {
        const text = await fetchWithTimeout(LOCAL_API_URL, FETCH_TIMEOUT_MS, {
            'X-API-Key': LOCAL_API_KEY
        });
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
        return { satellites: local.slice(0, MAX_SATELLITES), source: 'local-api' };
    }

    // 2. Fall back to CelesTrak
    let fallbackError: string | undefined;
    try {
        const text = await fetchWithTimeout(CELESTRAK_URL, FETCH_TIMEOUT_MS);
        const celestrak = parseTleText(text).slice(0, MAX_SATELLITES);
        if (celestrak.length > 0) {
            return { satellites: celestrak, source: 'celestrak' };
        }
        fallbackError = 'CelesTrak returned no TLE data.';
    } catch (error) {
        fallbackError = error instanceof Error ? error.message : String(error);
    }

    // 3. Fall back to bundled sample
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
