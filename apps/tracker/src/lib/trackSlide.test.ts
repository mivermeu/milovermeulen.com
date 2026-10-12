import { describe, expect, it } from 'bun:test';
import { firstVertexAtOrAfter, writeWindowEdges } from './trackSlide';

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

describe('writeWindowEdges', () => {
    // Chain: 9 vertices at unit x over [0, 8) ms; period 4 ms window.
    const positions = new Float32Array(9 * 3);
    for (let k = 0; k < 9; k++) positions.set([k, 0, 0], k * 3);
    const times = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const chain = { positions, times, vertexCount: 9, periodMs: 4 };

    it('splices the anchor as the head and reads forward (interpolated tail)', () => {
        const out = new Float32Array(5 * 6);
        const n = writeWindowEdges(
            chain.positions,
            chain.times,
            0,
            chain.vertexCount,
            chain.periodMs,
            [0.75, 0, 0], // live dot at t=0.75 (between v0 and v1)
            0.75, // target offset
            out,
            0,
            5
        );
        expect(n).toBe(5);
        // Edge 0: anchor → v1.
        expect(out[0]).toBeCloseTo(0.75, 6);
        expect(out[3]).toBeCloseTo(1, 6);
        // Edge 4: v4 → tail at exactly 4.75 (halfway v4→v5).
        expect(out[out.length - 6]).toBeCloseTo(4, 6);
        expect(out[out.length - 3]).toBeCloseTo(4.75, 6);
    });

    it('draws purely from the chain when there is no anchor', () => {
        const out = new Float32Array(4 * 6);
        const n = writeWindowEdges(
            chain.positions,
            chain.times,
            0,
            chain.vertexCount,
            chain.periodMs,
            null,
            2,
            out,
            0,
            4
        );
        // Window [2, 6] ends exactly on v6: chain edges plus the exact-end
        // tail segment (v5 → v6) — the tail is the unique final edge, not a duplicate.
        expect(n).toBe(4);
        // Edge 0 = (v2, v3) — the plain chain window start.
        expect(out[0]).toBeCloseTo(2, 6);
        expect(out[3]).toBeCloseTo(3, 6);
        // Last edge ends exactly at v6; the slot is full so no zero-pad remains.
        expect(out[3 * 6]).toBeCloseTo(5, 6);
        expect(out[3 * 6 + 3]).toBeCloseTo(6, 6);
    });

    it('handles a target past the bake end by holding the chain tail', () => {
        const out = new Float32Array(4 * 6);
        // target 6, period 4 → window [6, 10] beyond the 8 ms bake: draws to
        // the chain end (5 edges worth) but maxEdges caps it at the read rate.
        const n = writeWindowEdges(
            chain.positions,
            chain.times,
            0,
            chain.vertexCount,
            chain.periodMs,
            null,
            6,
            out,
            0,
            4
        );
        expect(n).toBe(2); // edges (v6,v7), (v7,v8) — then the tail is skipped
        expect(out[6]).toBeCloseTo(7, 6);
        expect(out[9]).toBeCloseTo(8, 6);
    });

    it('zero-pads unused tail slots (degenerate pairs render as nothing)', () => {
        const cap = 8;
        const padded = new Float32Array(cap * 6);
        writeWindowEdges(
            chain.positions,
            chain.times,
            0,
            chain.vertexCount,
            chain.periodMs,
            null,
            0,
            padded,
            0,
            cap
        );
        // Only (v0→v1),(v1→v2),(v2→v3),(v3→v4) — 4 edges of an 8-edge slot:
        // everything past them is zero-padded.
        for (let i = 4 * 6; i < cap * 6; i++) expect(padded[i]).toBe(0);
    });

    it('refuses (pads) when the window degenerates at the chain end', () => {
        const out = new Float32Array(4 * 6);
        out.fill(9);
        const n = writeWindowEdges(
            chain.positions,
            chain.times,
            0,
            chain.vertexCount,
            chain.periodMs,
            null,
            8, // target at the chain end — head = last vertex, degenerate
            out,
            0,
            4
        );
        expect(n).toBe(0);
        expect(out[0]).toBe(0); // zero-padded, not the stale fill(9)
    });

    it('pads the slot when the period is not positive', () => {
        for (const period of [0, -4, NaN]) {
            const out = new Float32Array(4 * 6);
            out.fill(9);
            const n = writeWindowEdges(
                chain.positions,
                chain.times,
                0,
                chain.vertexCount,
                period,
                null,
                2,
                out,
                0,
                4
            );
            expect(n).toBe(0);
            for (let i = 0; i < 4 * 6; i++) expect(out[i]).toBe(0);
        }
    });

    it('ends exactly on a vertex with the full final segment', () => {
        const out = new Float32Array(4 * 6);
        const n = writeWindowEdges(
            chain.positions,
            chain.times,
            0,
            chain.vertexCount,
            chain.periodMs,
            null,
            2, // window [2, 6] ends exactly on v6
            out,
            0,
            4
        );
        expect(n).toBe(4);
        for (let e = 0; e < n; e++) {
            // Every edge advances along the chain; none degenerate or repeated.
            expect(out[e * 6 + 3]).toBeGreaterThan(out[e * 6]);
        }
        // Tail lands exactly on v6.
        expect(out[3 * 6 + 3]).toBeCloseTo(6, 6);
    });

    it('erases the slot when the target runs past the whole bake (head < 0)', () => {
        const out = new Float32Array(4 * 6);
        out.fill(7);
        const n = writeWindowEdges(
            chain.positions,
            chain.times,
            0,
            chain.vertexCount,
            chain.periodMs,
            null,
            100,
            out,
            0,
            4
        );
        expect(n).toBe(0);
        for (let i = 0; i < 4 * 6; i++) expect(out[i]).toBe(0);
    });

    it('honors non-zero vertex offsets and output bases', () => {
        // Two concatenated chains; slide the second (offset 9 vertices).
        const positions = new Float32Array(18 * 3);
        for (let k = 0; k < 18; k++) positions.set([k, 0, 0], k * 3);
        const times = new Float32Array(18);
        for (let k = 0; k < 18; k++) times[k] = k < 9 ? k : 100 + (k - 9);
        const out = new Float32Array(2 * 4 * 6);
        out.fill(-1);
        const base = 4 * 6;
        const n = writeWindowEdges(positions, times, 9, 9, 4, null, 102, out, base, 4);
        // Slice-relative window [102, 106] → global vertices v11..v15.
        expect(n).toBe(4);
        expect(out[base]).toBeCloseTo(11, 6);
        expect(out[base + 3]).toBeCloseTo(12, 6);
        expect(out[base + 2 * 6 + 3]).toBeCloseTo(14, 6);
        expect(out[base + 3 * 6 + 3]).toBeCloseTo(15, 6);
        // Untouched region before the base keeps its fill.
        expect(out[0]).toBe(-1);
    });
});
