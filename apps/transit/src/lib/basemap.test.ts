import { describe, expect, test } from 'bun:test';

import { TILES_URL, basemapStyle } from './basemap';

const style = basemapStyle('https://example.com/nyc.pmtiles');
const layers = style.layers ?? [];

describe('basemap style', () => {
    test('declares a self-hosted glyph template', () => {
        expect(style.glyphs).toContain('{fontstack}');
        expect(style.glyphs).toContain('{range}');
        expect(style.glyphs).toContain('/fonts/glyphs/');
    });

    test('carries road and place label layers', () => {
        const ids = layers.map((layer) => layer.id);
        expect(ids).toContain('roads-label-major');
        expect(ids).toContain('roads-label-minor');
        expect(ids).toContain('places-neighbourhood');
        expect(ids).toContain('places-locality');
    });

    test('every symbol layer uses the bundled font stack', () => {
        const symbols = layers.filter((layer) => layer.type === 'symbol');
        expect(symbols.length).toBeGreaterThan(0);
        for (const layer of symbols) {
            if (layer.type === 'symbol') {
                expect(layer.layout?.['text-font']).toEqual(['NotoSansRegular']);
            }
        }
    });

    test('defaults to the z14 archive', () => {
        expect(TILES_URL).toContain('nyc-basemap-z14.pmtiles');
    });

    test('does not require a sprite', () => {
        expect(style.sprite).toBeUndefined();
    });
});
