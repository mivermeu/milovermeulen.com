import { browser } from '$app/environment';

/** Observer location for the pass finder. Geolocation fires only on explicit user action; coords persist in localStorage. */
export type ObserverStatus = 'unset' | 'locating' | 'set' | 'denied' | 'error';

export const observerState = $state({
    lat: null as number | null,
    lon: null as number | null,
    status: 'unset' as ObserverStatus,
    error: '',
    /** True when the OS/browser hard-denies location (retry alone can't fix it — UI shows recovery steps). */
    deniedHard: false
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
        // localStorage unavailable — state stays in-memory.
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
        // Corrupt storage — start empty.
    }
}

restore();

function round4(value: number): number {
    return Math.round(value * 10000) / 10000;
}

export function setManualLocation(latDeg: number, lonDeg: number): void {
    observerState.lat = round4(latDeg);
    observerState.lon = round4(lonDeg);
    observerState.status = 'set';
    observerState.error = '';
    observerState.deniedHard = false;
    persist();
}

export function clearLocation(): void {
    observerState.lat = null;
    observerState.lon = null;
    observerState.status = 'unset';
    observerState.error = '';
    observerState.deniedHard = false;
    persist();
}

/** Permission state read only to classify a denial after it happens ('unknown' where the API is missing). */
async function permissionSignal(): Promise<'denied' | 'prompt' | 'granted' | 'unknown'> {
    try {
        if (typeof navigator === 'undefined') return 'unknown';
        const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
        if (!permissions || typeof permissions.query !== 'function') {
            return 'unknown';
        }
        const status = await permissions.query({
            name: 'geolocation'
        } as PermissionDescriptor);
        if (status.state === 'denied' || status.state === 'prompt' || status.state === 'granted') {
            return status.state;
        }
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

const FIND_TIMEOUT_MS = 15000;
const RETRY_TIMEOUT_MS = 30000;

let geoAttempt = 0;

function applyDenied(hard: boolean): void {
    observerState.status = 'denied';
    observerState.deniedHard = hard;
    observerState.error = hard
        ? 'Location is blocked for this site — re-allow it in the browser settings, then try again.'
        : 'Location permission denied — enter coordinates manually.';
}

function issueGeolocationRequest(): void {
    const timeout = geoAttempt === 0 ? FIND_TIMEOUT_MS : RETRY_TIMEOUT_MS;
    navigator.geolocation.getCurrentPosition(
        (position) => {
            setManualLocation(position.coords.latitude, position.coords.longitude);
        },
        (err) => {
            if (observerState.status !== 'locating') return;
            if (err.code === err.PERMISSION_DENIED) {
                void permissionSignal().then((signal) => {
                    if (observerState.status !== 'locating') return;
                    if (signal === 'denied' || signal === 'unknown') {
                        applyDenied(true);
                        return;
                    }
                    if (signal === 'granted') {
                        // Browser allowed it but the OS refused underneath (e.g. system Location Services off).
                        observerState.status = 'denied';
                        observerState.deniedHard = false;
                        observerState.error =
                            'Location was refused despite permission — check System Settings → Privacy & Security → Location Services (on, with Safari enabled) on Mac, or Settings → Privacy & Security → Location Services on iPhone, then try again.';
                        return;
                    }
                    applyDenied(false);
                });
                return;
            }
            // One automatic retry with a longer timeout: desktop Safari's first Wi-Fi fix often lands just past a short timeout.
            if (geoAttempt === 0) {
                geoAttempt++;
                issueGeolocationRequest();
                return;
            }
            observerState.status = 'error';
            observerState.error =
                err.code === err.TIMEOUT
                    ? 'Timed out waiting for a location fix — check Wi-Fi is on (Macs locate via nearby networks), then try again.'
                    : 'No location fix available — check Location Services and Wi-Fi, then try again.';
        },
        { timeout, maximumAge: 5 * 60_000, enableHighAccuracy: false }
    );
}

/** Ask the browser for location. Must be called from the user gesture or Safari denies without prompting. */
export function requestGeolocation(): void {
    if (!browser) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        observerState.status = 'error';
        observerState.error = 'Geolocation is not available in this browser.';
        return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
        observerState.status = 'error';
        observerState.error = 'Location needs a secure (HTTPS) page — enter coordinates manually.';
        return;
    }
    observerState.status = 'locating';
    observerState.error = '';
    observerState.deniedHard = false;
    geoAttempt = 0;
    issueGeolocationRequest();
}
