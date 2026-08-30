import { describe, it, expect } from 'bun:test';
import { parseField, describeCron } from './cron';

describe('parseField', () => {
    it('asterisk returns the full range', () => {
        expect(parseField('*', 0, 59)).toHaveLength(60);
        expect(parseField('*', 1, 12)[0]).toBe(1);
    });
    it('a single value returns just that value', () => {
        expect(parseField('15', 0, 59)).toEqual([15]);
    });
    it('parses step expressions', () => {
        expect(parseField('*/10', 0, 59)).toEqual([0, 10, 20, 30, 40, 50]);
    });
    it('parses ranges', () => {
        expect(parseField('9-17', 0, 23)).toHaveLength(9);
        expect(parseField('9-17', 0, 23)[0]).toBe(9);
    });
    it('supports comma lists and dedupes', () => {
        expect(parseField('1,1,2', 0, 59)).toEqual([1, 2]);
        expect(parseField('0,30', 0, 59)).toEqual([0, 30]);
    });
    it('drops values outside the valid range', () => {
        expect(parseField('60', 0, 59)).toEqual([]);
        expect(parseField('7,8', 0, 7)).toEqual([7]);
    });
});

describe('describeCron', () => {
    it('describes a star schedule', () => {
        expect(describeCron(['*', '*', '*', '*', '*'])).toBe(
            'every minute, every hour, every day of month, every month, every day of week'
        );
    });
    it('describes a step schedule', () => {
        expect(describeCron(['*/5', '*', '*', '*', '*'])).toBe(
            'every 5 minutes, every hour, every day of month, every month, every day of week'
        );
    });
    it('rejects fewer than 5 fields', () => {
        expect(describeCron(['*', '*'])).toBe('Invalid: need 5 fields');
    });
});
