import { browser } from '$app/environment';
import { parseLatitude, parseLongitude } from './geo';

/**
 * Observer location state for the pass finder. The geolocation API is only
 * ever triggered by an explicit user action (the browser prompts from the
 * click handler); coordinates persist in localStorage so the panel survives
 * reloads. Everything is client-side.
 */
export type ObserverStatus = 'unset' | 'locating' | 'set' | 'denied' | 'error';

export const observerState = $state({
    lat: null as number | null,
    lon: null as number | null,
    status: 'unset' as ObserverStatus,
    error: ''
});

const STORAGE_KEY = 'tracker:observer:v1';

function persist(): void {
    if (!browser) return;
    try {
        if (observerState.lat === null || observerState.lon === null) {
            localStorage.removeItem(STORAGE_KEY);
        } else {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ lat: observerState.lat, lon: observerState.lon })
            );
        }
    } catch {
        // localStorage unavailable (private mode etc.) — state stays in-memory.
    }
}

function restore(): void {
    if (!browser) return;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data: unknown = JSON.parse(raw);
        if (
            typeof data === 'object' &&
            data !== null &&
            typeof (data as { lat?: unknown }).lat === 'number' &&
            typeof (data as { lon?: unknown }).lon === 'number'
        ) {
            const lat = (data as { lat: number }).lat;
            const lon = (data as { lon: number }).lon;
            if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                observerState.lat = lat;
                observerState.lon = lon;
                observerState.status = 'set';
            }
        }
    } catch {
        // Corrupt or unreadable storage — start empty.
    }
}

restore();

/** Roundtrip numbers to 4 decimals so persisted values stay tidy. */
function clampRound(value: number, min: number, max: number): number {
    const clipped = Math.min(max, Math.max(min, value));
    return Math.round(clipped * 10000) / 10000;
}

/** Enter coordinates manually (already validated by the form via `parse*`). */
export function setManualLocation(latDeg: number, lonDeg: number): void {
    if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return;
    observerState.lat = clampRound(latDeg, -90, 90);
    observerState.lon = clampRound(lonDeg, -180, 180);
    observerState.status = 'set';
    observerState.error = '';
    persist();
}

/** Forget the location entirely (back to the manual-entry form). */
export function clearLocation(): void {
    observerState.lat = null;
    observerState.lon = null;
    observerState.status = 'unset';
    observerState.error = '';
    persist();
}

/**
 * Ask the browser for the visitor's location. Only ever called from an
 * explicit user action — the permission prompt belongs to that gesture.
 */
export function requestGeolocation(): void {
    if (!browser) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        observerState.status = 'error';
        observerState.error = 'Geolocation is not available in this browser.';
        return;
    }
    observerState.status = 'locating';
    observerState.error = '';
    navigator.geolocation.getCurrentPosition(
        (position) => {
            setManualLocation(position.coords.latitude, position.coords.longitude);
        },
        (err) => {
            if (err.code === err.PERMISSION_DENIED) {
                observerState.status = 'denied';
                observerState.error = 'Location permission denied — enter coordinates manually.';
            } else {
                observerState.status = 'error';
                observerState.error = (err.message || 'Could not determine your location') + '.';
            }
        },
        { timeout: 15000, maximumAge: 5 * 60_000, enableHighAccuracy: false }
    );
}

/** Parse + validate a pair of manual-entry strings; returns null on any error. */
export function parseManualEntry(
    latText: string,
    lonText: string
): { lat: number; lon: number } | null {
    const lat = parseLatitude(latText);
    const lon = parseLongitude(lonText);
    if (lat === null || lon === null) return null;
    return { lat, lon };
}
