import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as wasm from './pkg/oscillator_rs';

const wasmBytes = readFileSync(join(process.cwd(), 'src/lib/wasm/pkg/oscillator_rs_bg.wasm'));

function sampleParams() {
    return {
        plot_type: { values: [0] },
        nsteps: { values: [200] },
        animation_period: { values: [5] },
        nu: { values: [1] },
        anti: { values: [1] },
        mass_ordering: { values: [1] },
        E: { values: [1] },
        L: { values: [0, 33060] },
        th12: { values: [0.5843] },
        th23: { values: [0.738] },
        th13: { values: [0.148] },
        Dm21sq: { values: [7.5] },
        Dm31sq: { values: [2.457] },
        dCP: { values: [-1.9477874452256714] },
        rho: { values: [0] }
    };
}

describe('WASM oscillator', () => {
    it('returns correct shape with probabilities summing to ~1', () => {
        wasm.initSync({ module: wasmBytes });

        const result = JSON.parse(wasm.oscillate(JSON.stringify(sampleParams())));
        const x = result[0] as number[];
        const y = result[1] as number[][];

        expect(Array.isArray(x)).toBe(true);
        expect(y).toHaveLength(3);
        expect(x.length).toBe(201);
        expect(y[0]).toHaveLength(x.length);
        expect(y[1]).toHaveLength(x.length);
        expect(y[2]).toHaveLength(x.length);

        for (let i = 0; i < x.length; i++) {
            const sum = y[0][i] + y[1][i] + y[2][i];
            expect(sum).toBeCloseTo(1, 5);
            for (const row of y) {
                expect(row[i]).toBeGreaterThanOrEqual(0);
                expect(row[i]).toBeLessThanOrEqual(1);
            }
        }
    });
});
