/**
 * Favorites / watch list: a set of NORAD catalog numbers persisted to
 * localStorage. The pure helpers here take a minimal storage-like value so they
 * are unit-testable; the reactive persistence lives in `url-sync.svelte.ts`.
 */

import { noradIdFromLine1 } from '$lib/url-state';

export interface KeyValueStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export const FAVORITES_KEY = 'tracker:favorites';

/** Load favorites from `store`, tolerating junk — only finite integers survive, deduped, in insertion order. */
export function loadFavorites(store: KeyValueStore | null | undefined): number[] {
    if (!store) return [];
    const raw = store.getItem(FAVORITES_KEY);
    if (!raw) return [];
    return saveFormatFilter(loadAsArray(raw));
}

function loadAsArray(raw: string): unknown[] {
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveFormatFilter(items: unknown[]): number[] {
    const out: number[] = [];
    const seen = new Set<number>();
    for (const item of items) {
        if (typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item >= 100000)
            continue;
        if (seen.has(item)) continue;
        seen.add(item);
        out.push(item);
    }
    return out;
}

/** Save favorites; storage failures (quota, private mode) are swallowed silently. */
export function saveFavorites(store: KeyValueStore | null | undefined, ids: number[]): void {
    if (!store) return;
    try {
        store.setItem(FAVORITES_KEY, JSON.stringify(ids));
    } catch {
        // Ignore — favorites are a convenience layer, never fatal.
    }
}

/**
 * Toggle a NORAD id in/out of the favorites list. Returns a NEW list
 * (insertion order preserved, removal in place), leaving the input untouched.
 */
export function toggleFavorite(ids: readonly number[], norad: number): number[] {
    if (ids.includes(norad)) {
        const removed = ids.filter((id) => id !== norad);
        return removed;
    }
    return [...ids, norad];
}

export function isFavorite(ids: readonly number[], norad: number | null): boolean {
    return norad !== null && ids.includes(norad);
}

/** NORAD id of the pinned satellite (used for the star button), or null. */
export function satelliteNorad(sat: { line1: string } | null | undefined): number | null {
    return sat ? noradIdFromLine1(sat.line1) : null;
}
