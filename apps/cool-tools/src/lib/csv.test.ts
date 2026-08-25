import { describe, it, expect } from 'bun:test';
import { csvEscape, csvToJson, jsonToCsv } from './csv';

describe('csvEscape', () => {
    it('leaves plain values untouched', () => {
        expect(csvEscape('hello')).toBe('hello');
        expect(csvEscape('')).toBe('');
    });
    it('quotes values containing the delimiter, quotes, or newlines', () => {
        expect(csvEscape('a,b')).toBe('"a,b"');
        expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
        expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    });
});

describe('csvToJson', () => {
    it('parses a header row into objects', () => {
        expect(csvToJson('name,age\nAlice,30\nBob,25', ',', true)).toBe(
            JSON.stringify([{ name: 'Alice', age: '30' }, { name: 'Bob', age: '25' }], null, 2)
        );
    });
    it('creates colN headers when hasHeader is false', () => {
        expect(csvToJson('a\nb', ',', false)).toBe(JSON.stringify([{ col1: 'a' }, { col1: 'b' }], null, 2));
    });
    it('parses quoted fields containing the delimiter and escaped quotes', () => {
        expect(csvToJson('a,b\n1,"x,y"\n2,"say ""hi"""', ',', true)).toBe(
            JSON.stringify([{ a: '1', b: 'x,y' }, { a: '2', b: 'say "hi"' }], null, 2)
        );
    });
});

describe('jsonToCsv', () => {
    it('serializes objects to CSV with escaping', () => {
        const csv = jsonToCsv(JSON.stringify([{ name: 'Alice', note: 'said, "hi"' }]), ',');
        expect(csv).toBe('name,note\nAlice,"said, ""hi"""');
    });
});

describe('csv round-trip', () => {
    it('json -> csv -> json preserves values', () => {
        const rows = [{ a: '1', b: 'x,y' }, { a: '2', b: 'quote "z"' }];
        const csv = jsonToCsv(JSON.stringify(rows), ',');
        expect(JSON.parse(csvToJson(csv, ',', true))).toEqual(rows);
    });
});