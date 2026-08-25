import { describe, it, expect } from 'vitest';
import { encodeUtf8, decodeUtf8, encodeArrayBuffer } from './base64';

describe('encodeUtf8 / decodeUtf8', () => {
    it('round-trips ASCII', () => {
        expect(decodeUtf8(encodeUtf8('hello world'))).toBe('hello world');
    });
    it('encodes UTF-8 (multibyte) correctly', () => {
        expect(encodeUtf8('héllo ☃')).toBe(btoa(String.fromCharCode(...new Uint8Array(new TextEncoder().encode('héllo ☃')))));
        expect(decodeUtf8(encodeUtf8('héllo ☃'))).toBe('héllo ☃');
    });
    it('round-trips empty string', () => {
        expect(decodeUtf8(encodeUtf8(''))).toBe('');
    });
});

describe('encodeArrayBuffer', () => {
    it('encodes raw bytes', () => {
        const bytes = new Uint8Array([0, 1, 2, 255]).buffer;
        expect(encodeArrayBuffer(bytes)).toBe(btoa(String.fromCharCode(0, 1, 2, 255)));
    });
});