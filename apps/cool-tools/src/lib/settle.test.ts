import { describe, it, expect } from 'vitest';
import { computeTransfers, rateOf } from './settle';

const alice = { name: 'Alice', id: 'a' };
const bob = { name: 'Bob', id: 'b' };
const carol = { name: 'Carol', id: 'c' };

describe('computeTransfers', () => {
    it('settles a simple split: Bob owes Alice half of a shared expense', () => {
        const transfers = computeTransfers(
            [alice, bob],
            [{ paidBy: 'a', amount: 30, splitAmong: ['a', 'b'], desc: 'dinner', currency: 'USD' }],
            'USD'
        );
        expect(transfers).toEqual([{ from: 'b', to: 'a', amount: 15 }]);
    });

    it('produces one transfer between two people for the net difference', () => {
        const transfers = computeTransfers(
            [alice, bob],
            [{ paidBy: 'a', amount: 40, splitAmong: ['a', 'b'], desc: 'groceries', currency: 'USD' }],
            'USD'
        );
        expect(transfers).toEqual([{ from: 'b', to: 'a', amount: 20 }]);
    });

    it('no expenses means no transfers', () => {
        expect(computeTransfers([alice, bob], [], 'USD')).toEqual([]);
    });

    it('no people means no transfers', () => {
        expect(computeTransfers([], [], 'USD')).toEqual([]);
    });

    it('converts foreign-currency expenses to the base currency', () => {
        // Alice paid 100 EUR; split between Alice & Bob. In USD (rate 0.92 EUR/USD),
        // that's ~108.70 USD, so Bob owes half (~54.35).
        const transfers = computeTransfers(
            [alice, bob],
            [{ paidBy: 'a', amount: 100, splitAmong: ['a', 'b'], desc: 'hotel', currency: 'EUR' }],
            'USD'
        );
        expect(transfers).toEqual([{ from: 'b', to: 'a', amount: 54.35 }]);
    });

    it('chains settlements among three people (net balances, not pairwise)', () => {
        // Alice paid 60 (split A+B+C); Bob paid 30 (split A+B+C).
        // Net: A +30, B 0, C -30 -> only Carol owes Alice 30.
        const transfers = computeTransfers(
            [alice, bob, carol],
            [
                { paidBy: 'a', amount: 60, splitAmong: ['a', 'b', 'c'], desc: 'x', currency: 'USD' },
                { paidBy: 'b', amount: 30, splitAmong: ['a', 'b', 'c'], desc: 'y', currency: 'USD' }
            ],
            'USD'
        );
        expect(transfers).toEqual([{ from: 'c', to: 'a', amount: 30 }]);
    });

    it('rateOf falls back to 1 for unknown currency codes', () => {
        expect(rateOf('XYZ')).toBe(1);
        expect(rateOf('EUR')).toBe(0.92);
    });
});