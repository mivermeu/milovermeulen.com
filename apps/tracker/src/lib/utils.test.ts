import { describe, it, expect } from 'bun:test';
import { sourceLabel } from './utils';

describe('sourceLabel', () => {
    it('maps all DataSource values', () => {
        expect(sourceLabel('celestrak')).toBe('CelesTrak (live)');
        expect(sourceLabel('sample')).toBe('Bundled sample');
        expect(sourceLabel('error')).toBe('No data');
        expect(sourceLabel('loading')).toBe('Loading\u2026');
    });
});
