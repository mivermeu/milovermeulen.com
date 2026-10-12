import { describe, expect, it } from 'bun:test';
import { isContiguousPairs, rotateTrackToAnchor, slideUniformWindow } from './trackSlide';

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

describe('rotateTrackToAnchor', () => {
    it('starts the window at the anchor, future-only', () => {
        const vertices = 12;
        const sub = circleRing(vertices);
        const out = new Float32Array(sub.length);
        // Anchor exactly at vertex 3 (90°): near (0, 1, 0).
        const anchor: [number, number, number] = [0, 1, 0];
        const head = rotateTrackToAnchor(sub, anchor, out);
        expect(head).toBe(3);
        expect(out.length).toBe(sub.length);
        // Vertex 0 of the rebuilt window is the anchor itself.
        expect(out[0]).toBeCloseTo(anchor[0], 6);
        expect(out[1]).toBeCloseTo(anchor[1], 6);
        // First non-anchor vertex is master vertex 4 (the next along the ring).
        expect(out[3]).toBeCloseTo(Math.cos((4 / vertices) * Math.PI * 2), 5);
        // Future-only: the final pair runs (v₁, v₂) — head−1 is never bridged
        // back to the anchor.
        expect(out[out.length - 6]).toBeCloseTo(Math.cos((1 / vertices) * Math.PI * 2), 5);
        expect(out[out.length - 3]).toBeCloseTo(Math.cos((2 / vertices) * Math.PI * 2), 5);
        expect(out[out.length - 2]).toBeCloseTo(Math.sin((2 / vertices) * Math.PI * 2), 5);
    });

    it('keeps the pair count and wraps coherently mid-ring', () => {
        const vertices = 8;
        const sub = circleRing(vertices);
        const out = new Float32Array(sub.length);
        const anchor: [number, number, number] = [0, -1, 0]; // vertex 6
        rotateTrackToAnchor(sub, anchor, out);
        // Pair 0 ends at vertex 7.
        expect(out[3]).toBeCloseTo(Math.cos((7 / vertices) * Math.PI * 2), 5);
        // Last pair runs (v₄, v₅) — one revolution ends a vertex before the head.
        const tail = out.length - 6;
        expect(out[tail]).toBeCloseTo(Math.cos((4 / vertices) * Math.PI * 2), 5);
        expect(out[tail + 3]).toBeCloseTo(Math.cos((5 / vertices) * Math.PI * 2), 5);
    });

    it('refuses degenerate slices or a mis-sized out buffer', () => {
        const sub = circleRing(3);
        expect(rotateTrackToAnchor(sub, [1, 0, 0], new Float32Array(sub.length + 6))).toBe(-1);
        expect(rotateTrackToAnchor(new Float32Array(6), [1, 0, 0], new Float32Array(6))).toBe(-1);
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
