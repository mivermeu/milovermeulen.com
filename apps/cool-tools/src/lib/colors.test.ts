import { describe, it, expect } from 'bun:test';
import { hexToRgb, rgbToHsl, hslToHex, luminance, contrastRatio } from './colors';

describe('hexToRgb', () => {
    it('parses hex to rgb', () => {
        expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
        expect(hexToRgb('#00ff80')).toEqual([0, 255, 128]);
        expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    });
});

describe('hsl round-trip', () => {
    it('rgb -> hsl -> hex reproduces the original color', () => {
        for (const hex of ['#ff6b6b', '#6bcbff', '#123abc', '#888888']) {
            const [r, g, b] = hexToRgb(hex);
            const [h, s, l] = rgbToHsl([r, g, b]);
            expect(hslToHex(h, s, l)).toBe(hex);
        }
    });
});

describe('luminance', () => {
    it('black and white are extremes', () => {
        expect(luminance('#000000')).toBe(0);
        expect(luminance('#ffffff')).toBe(1);
    });
});

describe('contrastRatio', () => {
    it('black on white is exactly 21:1', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    });
    it('same color is 1:1', () => {
        expect(contrastRatio('#ff0000', '#ff0000')).toBe(1);
    });
});