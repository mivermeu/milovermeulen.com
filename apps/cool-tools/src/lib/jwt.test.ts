import { describe, it, expect } from 'vitest';
import { b64urlToJson } from './jwt';

describe('b64urlToJson', () => {
    it('decodes a real unpadded HS256 header (36 chars, missing padding)', () => {
        expect(b64urlToJson('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toEqual({ alg: 'HS256', typ: 'JWT' });
    });
    it('decodes a padded base64url payload', () => {
        expect(b64urlToJson('eyJzdWIiOiIxMjM0NTY3ODkwIn0')).toEqual({ sub: '1234567890' });
    });
    it('handles url-safe characters (- and _)', () => {
        expect(b64urlToJson('eyJzdWIiOiItXyJ9')).toEqual({ sub: '-_' });
    });
});