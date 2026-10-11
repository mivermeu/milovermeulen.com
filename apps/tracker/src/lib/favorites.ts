/**
 * Favorites / watch list: a set of NORAD catalog numbers persisted to
 * localStorage. The pure helpers here take a minimal storage-like value so they
 * are unit-testable; the reactive persistence lives in `url-sync.svelte.ts`.
 */

import { isValidNorad } from '$lib/url-state';

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export const FAVORITES_KEY = 'tracker:favorites';

/** Load favorites from `store`, tolerating junk — only valid NORAD ids survive, deduped, in insertion order. */
export function loadFavorites(store: KeyValueStore | null | undefined): number[] {
    if (!store) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(store.getItem(FAVORITES_KEY) ?? '');
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out: number[] = [];
    const seen = new Set<number>();
    for (const item of parsed) {
        if (typeof item !== 'number' || !isValidNorad(item)) continue;
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
