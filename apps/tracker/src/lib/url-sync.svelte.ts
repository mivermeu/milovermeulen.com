/**
 * Reactive glue between trackerState and the shareable URL + favorites store.
 *
 * - Applies URL deep-link params once, after the catalog AND the filter tree
 *   have initialised (URL params win over whatever else is loaded; favorites
 *   are an independent convenience layer).
 * - Writes mode/frame/graph axes/pinned satellite back to the URL with
 *   `history.replaceState` — debounced, and ONLY when the value actually
 *   changes; never pushes a history entry.
 * - Loads favorites from localStorage at startup and saves on every change.
 *
 * All effects run inside a `$effect.root`, so the whole feature is created and
 * disposed by the caller (the page mounts it exactly once).
 *
 * Svelte 5 note: every read inside an $effect is tracked. Deep reads of the
 * `satellites` proxy (e.g. scanning TLE lines for a NORAD id) are deliberately
 * `untrack`ed — a tracked deep read re-fires the effect whenever the catalog
 * object graph mutates.
 */

import { untrack } from 'svelte';
import { trackerState, pinSatellite } from '$lib/state.svelte';
import {
    parseTrackerUrlParams,
    encodeTrackerUrlParams,
    catalogByNorad,
    noradId,
    type TrackerUrlParams
} from '$lib/url-state';
import { loadFavorites, saveFavorites, type KeyValueStore } from '$lib/favorites';

const WRITE_DEBOUNCE_MS = 300;

export function initTrackerUrlSync(): () => void {
    const browser = typeof window !== 'undefined' && typeof history !== 'undefined';

    return $effect.root(() => {
        if (!browser) return;

        let appliedUrlState = false;
        let lastWrittenQuery = encodeTrackerUrlParams({});

        // --- Apply URL params once, after catalog + tree init ----------------
        $effect(() => {
            if (appliedUrlState) return;
            // Track only the readiness signals, never the catalog contents.
            const tree = trackerState.tree;
            const count = trackerState.satellites.length;
            if (!tree || count === 0) return;

            const params = parseTrackerUrlParams(window.location.search);
            appliedUrlState = true;

            if (params.mode !== undefined) trackerState.elementMode = params.mode;
            if (params.frame !== undefined) trackerState.referenceFrame = params.frame;
            if (params.gx !== undefined) trackerState.graphXKey = params.gx;
            if (params.gy !== undefined) trackerState.graphYKey = params.gy;

            if (params.sat !== undefined) {
                const index = untrack(() =>
                    catalogByNorad(trackerState.satellites).get(params.sat ?? -1)
                );
                if (index !== undefined) {
                    // Activate via the filter tree + reveal, then pin.
                    untrack(() => pinSatellite(index));
                }
            }
        });

        // --- Mirror state back into the URL (debounced replaceState) ---------
        $effect(() => {
            const mode = trackerState.elementMode;
            const frame = trackerState.referenceFrame;
            const gx = trackerState.graphXKey;
            const gy = trackerState.graphYKey;
            const pinned = trackerState.pinnedIndex;
            // Scan the TLE line for the pinned satellite's NORAD id untracked:
            // a tracked deep read of `satellites` would re-fire this effect on
            // any catalog object mutation.
            const sat = untrack(() => {
                const s = trackerState.satellites[pinned];
                return s ? (noradId(s) ?? undefined) : undefined;
            });

            const params: TrackerUrlParams = { sat, mode, frame, gx, gy };
            const query = encodeTrackerUrlParams(params);
            if (query === lastWrittenQuery) return;
            lastWrittenQuery = query;

            // Keep the (static) path base; just swap the query string.
            const href = window.location.href;
            const pathHref = href.split('?')[0];
            const next = query ? `${pathHref}?${query}` : pathHref;
            const timer = setTimeout(() => {
                if (next !== window.location.href) {
                    history.replaceState(history.state, '', next);
                }
            }, WRITE_DEBOUNCE_MS);
            return () => clearTimeout(timer);
        });

        // --- Favorites: load once, save on change ---------------------------
        let store: KeyValueStore;
        try {
            store = window.localStorage;
        } catch {
            store = {
                getItem: () => null,
                setItem: () => undefined
            };
        }

        if (trackerState.favorites.length === 0) trackerState.favorites = loadFavorites(store);

        $effect(() => {
            const favorites = trackerState.favorites;
            saveFavorites(store, favorites);
        });
    });
}
