import { describe, expect, it } from 'bun:test';
import { firstVertexAtOrAfter, isContiguousPairs, slideUniformWindow } from './trackSlide';

/** Build a flat pair-chain of a closed ring with `v` vertices on the unit circle. */
function circleRing(vertices: number): Float32Array {
    const sub = new Float32Array((vertices - 1) * 6);
    const at = (i: number): [number, number, number] => [
        Math.cos((i / vertices) * Math.PI * 2),
        Math.sin((i / vertices) * Math.PI * 2),
        0
    ];
    for (let j = 0; j < vertices - 1; j++) {
        const [ax, ay, az] = at(j);
        const [bx, by, bz] = at(j + 1);
        sub.set([ax, ay, az, bx, by, bz], j * 6);
    }
    return sub;
}

describe('firstVertexAtOrAfter', () => {
    // Two-period chain: offsets double the [0, 60) grid over [0, 120).
    const times = new Float32Array([0, 10, 20, 25, 35, 45, 50, 60, 70, 80, 85, 95, 105, 110]);

    it('finds the first vertex at or after the target', () => {
        expect(firstVertexAtOrAfter(times, 0, times.length, 25)).toBe(3);
        expect(firstVertexAtOrAfter(times, 0, times.length, 26)).toBe(4);
        expect(firstVertexAtOrAfter(times, 0, times.length, 0)).toBe(0);
        // A snap-forward target just past a step boundary.
        expect(firstVertexAtOrAfter(times, 0, times.length, 60)).toBe(7);
    });

    it('searches within a per-sat slice', () => {
        // Second chain: offset 7, count 7 (values 50..110).
        expect(firstVertexAtOrAfter(times, 7, 7, 85)).toBe(3);
        expect(firstVertexAtOrAfter(times, 7, 7, 10)).toBe(0);
    });

    it('returns −1 when the target lies beyond the chain (overdue rebuild)', () => {
        expect(firstVertexAtOrAfter(times, 0, times.length, 120)).toBe(-1);
        expect(firstVertexAtOrAfter(times, 0, 0, 0)).toBe(-1);
        expect(firstVertexAtOrAfter(times, 11, 4, 0)).toBe(-1); // slice out of bounds
    });
});

describe('isContiguousPairs', () => {
    it('accepts a chain whose pairs share endpoints', () => {
        expect(isContiguousPairs(circleRing(8))).toBe(true);
    });

    it('rejects a chain with an SGP4-failure gap', () => {
        const broken = circleRing(8);
        // Displace pair 3's start so it no longer continues pair 2.
        broken[3 * 6] += 5;
        expect(isContiguousPairs(broken)).toBe(false);
    });
});

describe('slideUniformWindow', () => {
    // Master with 9 vertices (8 pairs) at unit increments along the x axis.
    const master = new Float32Array(8 * 6);
    for (let k = 0; k < 8; k++) {
        master.set([k, 0, 0, k + 1, 0, 0], k * 6);
    }

    it('starts the window at the anchor and reads forward un-shifted', () => {
        const out = new Float32Array(4 * 6);
        const n = slideUniformWindow(master, 0, 4, [0.5, 0.5, 0], out);
        expect(n).toBe(4);
        // Pair 0 connects the anchor directly to master vertex 1.
        expect(out[0]).toBeCloseTo(0.5, 6);
        expect(out[1]).toBeCloseTo(0.5, 6);
        expect(out[3]).toBeCloseTo(1, 6);
        // Pair 2 runs (v₂, v₃): the anchor replaces master vertex 0.
        expect(out[9]).toBeCloseTo(2, 6);
    });

    it('slides the window for a mid-master head', () => {
        const out = new Float32Array(4 * 6);
        // headFrac 0.5 of a 4-step window → master vertex 2 first (x = 2).
        const n = slideUniformWindow(master, 0.5, 4, [2, 0, 0], out);
        expect(n).toBe(4);
        expect(out[0]).toBeCloseTo(2, 6);
        expect(out[3]).toBeCloseTo(3, 6);
        expect(out[out.length - 6]).toBeCloseTo(5, 6);
        expect(out[out.length - 3]).toBeCloseTo(6, 6);
    });

    it('refuses a window running past the baked span', () => {
        const out = new Float32Array(4 * 6);
        // headFrac 1.3 would need vertices 6..9 past the 9-vertex master.
        expect(slideUniformWindow(master, 1.3, 4, [4, 0, 0], out)).toBe(-1);
        expect(slideUniformWindow(master, -0.1, 4, [0, 0, 0], out)).toBe(-1);
        expect(slideUniformWindow(master, 0.4, 4, [2, 0, 0], new Float32Array(4 * 6 + 6))).toBe(-1);
    });
});
