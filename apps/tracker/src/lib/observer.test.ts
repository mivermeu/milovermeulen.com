import { describe, expect, test, beforeEach } from 'bun:test';
import {
    clearLocation,
    observerState,
    requestGeolocation,
    setManualLocation
} from './observer.svelte';

type GeolocationMock = {
    mode: { kind: 'success'; lat: number; lon: number } | { kind: 'error'; code: number };
    calls: number;
    pending: Array<{
        success: (p: { coords: { latitude: number; longitude: number } }) => void;
        error: (e: { code: number; PERMISSION_DENIED: number; TIMEOUT: number }) => void;
    }>;
    /** Resolve the oldest pending request with the current mode. */
    respond: () => void;
};

function installNavigator(options: {
    permissionState?: 'granted' | 'denied' | 'prompt';
    geo?: GeolocationMock['mode'];
    secure?: boolean;
}): GeolocationMock {
    const mock: GeolocationMock = {
        mode: { kind: 'success', lat: 47.38, lon: 8.54 },
        calls: 0,
        pending: [],
        respond: () => {
            const next = mock.pending.shift();
            if (!next) throw new Error('no pending geolocation request');
            if (mock.mode.kind === 'success') {
                next.success({
                    coords: { latitude: mock.mode.lat, longitude: mock.mode.lon }
                });
            } else {
                next.error({ code: mock.mode.code, PERMISSION_DENIED: 1, TIMEOUT: 3 });
            }
        }
    };
    if (options.geo) mock.mode = options.geo;
    const nav = {
        geolocation: {
            getCurrentPosition(
                success: (p: { coords: { latitude: number; longitude: number } }) => void,
                error: (e: { code: number; PERMISSION_DENIED: number; TIMEOUT: number }) => void
            ): void {
                mock.calls++;
                mock.pending.push({ success, error });
            }
        },
        permissions:
            options.permissionState === undefined
                ? undefined
                : {
                      query: () =>
                          Promise.resolve({
                              state: options.permissionState
                          })
                  }
    };
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
    Object.defineProperty(globalThis, 'window', {
        value: { isSecureContext: options.secure ?? true },
        configurable: true
    });
    return mock;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

beforeEach(() => {
    clearLocation();
});

describe('observer geolocation', () => {
    test('success stores rounded coordinates', async () => {
        const mock = installNavigator({});
        requestGeolocation();
        expect(observerState.status).toBe('locating');
        await flush(); // pre-check → request issued
        expect(mock.calls).toBe(1);
        mock.respond();
        expect(observerState.status).toBe('set');
        expect(observerState.lat).toBeCloseTo(47.38, 4);
        expect(observerState.deniedHard).toBe(false);
    });

    test('hard-deny via Permissions API reports recovery guidance', async () => {
        const mock = installNavigator({
            permissionState: 'denied',
            geo: { kind: 'error', code: 1 }
        });
        requestGeolocation();
        await flush();
        expect(mock.calls).toBe(1);
        mock.respond();
        await flush(); // post-failure classification
        expect(observerState.status).toBe('denied');
        expect(observerState.deniedHard).toBe(true);
    });

    test('denial without a Permissions API is treated as hard (Safari)', async () => {
        const mock = installNavigator({ geo: { kind: 'error', code: 1 } });
        requestGeolocation();
        await flush();
        mock.respond();
        await flush();
        expect(observerState.status).toBe('denied');
        expect(observerState.deniedHard).toBe(true);
    });

    test('fresh decline reports a soft deny when permission is not hard-denied', async () => {
        const mock = installNavigator({
            permissionState: 'prompt',
            geo: { kind: 'error', code: 1 }
        });
        requestGeolocation();
        await flush();
        expect(mock.calls).toBe(1);
        mock.respond();
        await flush(); // post-failure permission re-check
        expect(observerState.status).toBe('denied');
        expect(observerState.deniedHard).toBe(false);
    });

    test('silent deny classifies via post-failure check', async () => {
        // Safari's remembered-deny: the request fails without prompting; the
        // post-failure check reports the stored denial.
        const mock = installNavigator({
            permissionState: 'denied',
            geo: { kind: 'error', code: 1 }
        });
        requestGeolocation();
        await flush();
        expect(mock.calls).toBe(1);
        mock.respond();
        await flush();
        expect(observerState.status).toBe('denied');
        expect(observerState.deniedHard).toBe(true);
    });

    test('timeout retries once with recovery guidance on repeated failure', async () => {
        const mock = installNavigator({
            permissionState: 'prompt',
            geo: { kind: 'error', code: 3 }
        });
        requestGeolocation();
        await flush();
        expect(mock.calls).toBe(1);
        mock.respond(); // first attempt times out → automatic retry
        expect(mock.calls).toBe(2);
        expect(observerState.status).toBe('locating');
        mock.respond(); // retry times out too → surfaced error
        expect(observerState.status).toBe('error');
        expect(observerState.error).toMatch(/Timed out/);
    });

    test('timeout followed by success stores the fix', async () => {
        const mock = installNavigator({
            permissionState: 'prompt',
            geo: { kind: 'error', code: 3 }
        });
        requestGeolocation();
        await flush();
        mock.respond(); // first attempt times out → automatic retry
        expect(mock.calls).toBe(2);
        mock.mode = { kind: 'success', lat: 47.38, lon: 8.54 };
        mock.respond();
        expect(observerState.status).toBe('set');
        expect(observerState.lat).toBeCloseTo(47.38, 4);
    });

    test('unavailable fix reports services guidance after one retry', async () => {
        const mock = installNavigator({
            permissionState: 'prompt',
            geo: { kind: 'error', code: 2 }
        });
        requestGeolocation();
        await flush();
        mock.respond();
        expect(mock.calls).toBe(2);
        mock.respond();
        expect(observerState.status).toBe('error');
        expect(observerState.error).toMatch(/Location Services/);
    });
    test('denial despite granted permission points at system settings', async () => {
        const mock = installNavigator({
            permissionState: 'granted',
            geo: { kind: 'error', code: 1 }
        });
        requestGeolocation();
        await flush();
        mock.respond();
        await flush();
        expect(observerState.status).toBe('denied');
        expect(observerState.deniedHard).toBe(false);
        expect(observerState.error).toMatch(/Location Services/);
    });
    test('non-secure contexts fail fast with guidance', async () => {
        const mock = installNavigator({ secure: false });
        requestGeolocation();
        await flush();
        expect(mock.calls).toBe(0);
        expect(observerState.status).toBe('error');
        expect(observerState.error).toMatch(/HTTPS/);
    });

    test('manual entry rounds and clears the hard-deny flag', () => {
        installNavigator({ permissionState: 'denied' });
        observerState.deniedHard = true;
        observerState.status = 'denied';
        setManualLocation(47.37812, 8.53671);
        expect<string>(observerState.status).toBe('set');
        expect(observerState.lat).toBe(47.3781);
        expect(observerState.deniedHard).toBe(false);
    });
});
