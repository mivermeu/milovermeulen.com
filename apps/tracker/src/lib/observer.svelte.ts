import { browser } from '$app/environment';

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
    error: '',
    /**
     * True when the OS/browser is hard-denying location for this site (a
     * remembered "Don't Allow", e.g. Safari's per-website setting or system
     * Location Services off) instead of prompting. Retrying alone can't fix
     * that — the UI shows recovery steps. Detected via the Permissions API
     * when available, else after a silent PERMISSION_DENIED.
     */
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

/** Round to 4 decimals so persisted values stay tidy. */
function round4(value: number): number {
    return Math.round(value * 10000) / 10000;
}

/** Enter coordinates (already range-validated upstream — parse or geolocation). */
export function setManualLocation(latDeg: number, lonDeg: number): void {
    observerState.lat = round4(latDeg);
    observerState.lon = round4(lonDeg);
    observerState.status = 'set';
    observerState.error = '';
    observerState.deniedHard = false;
    persist();
}

/** Forget the location entirely (back to the manual-entry form). */
export function clearLocation(): void {
    observerState.lat = null;
    observerState.lon = null;
    observerState.status = 'unset';
    observerState.error = '';
    observerState.deniedHard = false;
    persist();
}

/**
 * Best-effort read of the geolocation permission state, used only to
 * classify a denial AFTER it happens. 'unknown' covers browsers without the
 * API (notably Safari for this descriptor) and any query failure.
 */
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

/** Zero-based attempt counter for the in-flight request (reset per user tap). */
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
                // Fresh decline or silent remembered-deny — classify after
                // the fact. 'prompt'/'granted' means the user just declined a
                // visible prompt (soft); 'denied' — or an unknown state, as on
                // Safari, which doesn't expose this descriptor — means retrying
                // alone can't succeed, so show the recovery steps.
                void permissionSignal().then((signal) => {
                    if (observerState.status !== 'locating') return;
                    // 'denied'/unknown: retrying alone can't succeed — recovery steps.
                    if (signal === 'denied' || signal === 'unknown') {
                        applyDenied(true);
                        return;
                    }
                    // 'prompt': the user just declined a visible prompt.
                    // 'granted' with a denial anyway means the OS refused
                    // underneath the browser (e.g. macOS Location Services off
                    // or Safari unchecked) — that needs system settings, not a
                    // re-prompt.
                    if (signal === 'granted') {
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
            // One automatic retry with a doubled timeout: desktop Safari
            // resolves position over nearby Wi-Fi networks, whose first fix
            // often lands just past a short timeout.
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

/**
 * Ask the browser for the visitor's location. Only ever called from an
 * explicit user action — the permission prompt belongs to that gesture.
 *
 * Safari (and other browsers) remember a per-site "Don't Allow" and fail
 * subsequent requests immediately with PERMISSION_DENIED instead of
 * re-prompting; system-level Location Services off does the same. Those
 * cases set `deniedHard` so the UI shows recovery steps instead of a bare
 * retry button that can never succeed.
 */
export function requestGeolocation(): void {
    if (!browser) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        observerState.status = 'error';
        observerState.error = 'Geolocation is not available in this browser.';
        return;
    }
    // Geolocation requires a secure context; on plain HTTP every browser
    // denies without prompting, which otherwise looks like a user denial.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
        observerState.status = 'error';
        observerState.error = 'Location needs a secure (HTTPS) page — enter coordinates manually.';
        return;
    }
    observerState.status = 'locating';
    observerState.error = '';
    observerState.deniedHard = false;
    geoAttempt = 0;
    // Called synchronously in the user gesture: Safari only shows its
    // permission prompt when the request originates in the tap handler — a
    // pre-check await would detach it and Safari denies without prompting.
    // Classification of any denial happens after the fact (see above).
    issueGeolocationRequest();
}
