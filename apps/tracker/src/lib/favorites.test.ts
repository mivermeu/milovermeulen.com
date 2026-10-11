import { describe, it, expect } from 'bun:test';
import {
    loadFavorites,
    saveFavorites,
    toggleFavorite,
    isFavorite,
    FAVORITES_KEY,
    type KeyValueStore
} from './favorites';

function memoryStore(
    initial: Record<string, string> = {}
): KeyValueStore & { data: Map<string, string> } {
    const data = new Map(Object.entries(initial));
    return {
        data,
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => {
            data.set(key, value);
        }
    };
}

describe('loadFavorites', () => {
    it('reads a stored list', () => {
        const store = memoryStore({ [FAVORITES_KEY]: '[25544, 45000]' });
        expect(loadFavorites(store)).toEqual([25544, 45000]);
    });

    it('returns empty for missing or malformed data', () => {
        expect(loadFavorites(memoryStore())).toEqual([]);
        expect(loadFavorites(memoryStore({ [FAVORITES_KEY]: 'garbage' }))).toEqual([]);
        expect(loadFavorites(memoryStore({ [FAVORITES_KEY]: '{"nope": 1}' }))).toEqual([]);
        expect(loadFavorites(null)).toEqual([]);
    });

    it('filters out junk entries and deduplicates', () => {
        const store = memoryStore({ [FAVORITES_KEY]: '[25544, "x", -3, 12.5, 999999, 25544]' });
        expect(loadFavorites(store)).toEqual([25544]);
    });
});

describe('saveFavorites', () => {
    it('writes JSON to the store key', () => {
        const store = memoryStore();
        saveFavorites(store, [25544, 45000]);
        expect(store.data.get(FAVORITES_KEY)).toBe('[25544,45000]');
        expect(loadFavorites(store)).toEqual([25544, 45000]);
    });

    it('swallows storage failures', () => {
        const throwing: KeyValueStore = {
            getItem: () => null,
            setItem: () => {
                throw new Error('QuotaExceededError');
            }
        };
        expect(() => saveFavorites(throwing, [1])).not.toThrow();
    });
});

describe('toggleFavorite', () => {
    it('adds a NORAD id', () => {
        expect(toggleFavorite([25544], 45000)).toEqual([25544, 45000]);
        expect(toggleFavorite([], 25544)).toEqual([25544]);
    });

    it('removes an existing id, preserving the order of the rest', () => {
        expect(toggleFavorite([25544, 45000, 100], 45000)).toEqual([25544, 100]);
    });

    it('does not mutate the input list', () => {
        const ids = [25544];
        toggleFavorite(ids, 45000);
        toggleFavorite(ids, 25544);
        expect(ids).toEqual([25544]);
    });
});

describe('isFavorite', () => {
    it('checks membership', () => {
        expect(isFavorite([25544], 25544)).toBe(true);
        expect(isFavorite([25544], 45000)).toBe(false);
        expect(isFavorite([25544], null)).toBe(false);
    });
});
