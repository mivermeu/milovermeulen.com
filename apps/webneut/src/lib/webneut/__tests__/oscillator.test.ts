import { describe, it, expect } from 'vitest';
import { pi } from 'mathjs';
import { Oscillator } from '../Oscillator';
import { PlotType, type OscillationParameters } from '../types';

function defaultParameters(): OscillationParameters {
    return {
        plot_type: {
            values: [PlotType.Linear],
            label: 'Plot type',
            snaps: [],
            precision: 0,
            limits: [PlotType.Linear, PlotType.Ternary]
        },
        nsteps: {
            values: [500],
            label: 'Number of points',
            snaps: [],
            precision: 0,
            limits: [1, 1000]
        },
        animation_period: {
            values: [5],
            label: 'Animation period [s]',
            snaps: [],
            precision: 1,
            limits: [1, 20]
        },
        nu: {
            values: [1],
            label: 'Neutrino flavour',
            snaps: [0, 1, 2],
            precision: 0,
            limits: [0, 2]
        },
        anti: {
            values: [1],
            label: 'Chirality',
            snaps: [],
            precision: 0,
            limits: [-1, 1]
        },
        E: {
            values: [1],
            label: 'Energy [GeV]',
            snaps: [],
            precision: 3,
            limits: [0.3, 20]
        },
        L: {
            values: [0, 33060],
            label: 'Path length [km]',
            snaps: [],
            precision: 0,
            limits: [0, 40000]
        },
        th12: {
            values: [0.5843],
            label: '\u03b8<sub>12</sub> [rad]',
            snaps: [0.5843, pi / 2],
            precision: 4,
            limits: [0, pi]
        },
        th23: {
            values: [0.738],
            label: '\u03b8<sub>23</sub> [rad]',
            snaps: [0.738, pi / 2],
            precision: 4,
            limits: [0, pi]
        },
        th13: {
            values: [0.148],
            label: '\u03b8<sub>13</sub> [rad]',
            snaps: [0.148, pi / 2, pi, (pi / 2) * 3],
            precision: 4,
            limits: [0, 2 * pi]
        },
        Dm21sq: {
            values: [7.5],
            label: '\u0394m<sub>21</sub><sup>2</sup> [10<sup>-5</sup> eV<sup>2</sup>]',
            snaps: [7.5],
            precision: 4,
            limits: [0, 10]
        },
        Dm31sq: {
            values: [2.457],
            label: '\u0394m<sub>31</sub><sup>2</sup> [10<sup>-5</sup> eV<sup>2</sup>]',
            snaps: [2.457, 0, -2.457],
            precision: 4,
            limits: [-5, 5]
        },
        dCP: {
            values: [-0.62 * pi],
            label: '\u03b4<sub>CP</sub> [rad]',
            snaps: [-0.62 * pi, 0, pi / 2, -pi / 2],
            precision: 4,
            limits: [-pi, pi]
        },
        rho: {
            values: [0],
            label: '\u03c1 [kg/m<sup>3</sup>]',
            snaps: [2600],
            precision: 0,
            limits: [0, 10000]
        }
    };
}

describe('Oscillator', () => {
    it('returns correct shape from oscillate()', () => {
        const params = defaultParameters();
        const osc = new Oscillator(params);
        const [x, y] = osc.oscillate();

        expect(Array.isArray(x)).toBe(true);
        expect(Array.isArray(y)).toBe(true);
        expect(y).toHaveLength(3);
        expect(x.length).toBeGreaterThan(0);
        expect(y[0]).toHaveLength(x.length);
        expect(y[1]).toHaveLength(x.length);
        expect(y[2]).toHaveLength(x.length);
    });

    it('default parameters use L as range with 500 steps', () => {
        const params = defaultParameters();
        const osc = new Oscillator(params);
        const [x, y] = osc.oscillate();

        expect(x.length).toBe(501);
        expect(x[0]).toBe(0);
        expect(x[x.length - 1]).toBe(33060);
    });

    it('produces probabilities that sum to ~1', () => {
        const params = defaultParameters();
        const osc = new Oscillator(params);
        const [x, y] = osc.oscillate();

        for (let i = 0; i < x.length; i++) {
            const sum = y[0][i] + y[1][i] + y[2][i];
            expect(sum).toBeCloseTo(1, 5);
        }
    });

    it('produces values between 0 and 1', () => {
        const params = defaultParameters();
        const osc = new Oscillator(params);
        const [, y] = osc.oscillate();

        for (const row of y) {
            for (const val of row) {
                expect(val).toBeGreaterThanOrEqual(0);
                expect(val).toBeLessThanOrEqual(1);
            }
        }
    });

    it('recomputes when parameters change', () => {
        const params = defaultParameters();
        const osc = new Oscillator(params);
        const [x1, y1] = osc.oscillate();

        const modified = structuredClone(params);
        modified.E.values = [0.3, 20];
        modified.L.values = [33060];
        const [x2, y2] = osc.oscillate(modified);

        expect(x2[0]).toBeCloseTo(0.3, 3);
        expect(x2[x2.length - 1]).toBeCloseTo(20, 3);
        expect(y2[0][0]).not.toBe(y1[0][0]);
    });

    it('updates a single parameter via update()', () => {
        const params = defaultParameters();
        const osc = new Oscillator(params);
        const [, y1] = osc.oscillate();

        const modified = structuredClone(params);
        modified.th23.values[0] = Math.PI / 2;
        const [, y2] = osc.oscillate(modified);

        const anyDifferent = y2.some((row, i) =>
            row.some((val, j) => Math.abs(val - y1[i][j]) > 1e-10)
        );
        expect(anyDifferent).toBe(true);
    });

    it('matter effect changes probabilities when rho > 0', () => {
        const params = defaultParameters();
        const osc = new Oscillator(params);
        const [, yVac] = osc.oscillate();

        const matterParams = structuredClone(params);
        matterParams.rho.values = [2600]; // rock density
        const [, yMat] = osc.oscillate(matterParams);

        const anyDifferent = yMat.some((row, i) =>
            row.some((val, j) => Math.abs(val - yVac[i][j]) > 1e-10)
        );
        expect(anyDifferent).toBe(true);
    });
});

describe('default parameters', () => {
    const params = defaultParameters();

    it('has all required keys', () => {
        const required = [
            'plot_type', 'nsteps', 'animation_period',
            'nu', 'anti', 'E', 'L',
            'th12', 'th23', 'th13',
            'Dm21sq', 'Dm31sq', 'dCP', 'rho'
        ];
        for (const key of required) {
            expect(params).toHaveProperty(key);
        }
    });

    it('has valid parameter shapes', () => {
        for (const param of Object.values(params)) {
            expect(Array.isArray(param.values)).toBe(true);
            expect(param.values.length).toBeGreaterThan(0);
            expect(Array.isArray(param.limits)).toBe(true);
            expect(param.limits).toHaveLength(2);
            expect(typeof param.precision).toBe('number');
            expect(typeof param.label).toBe('string');
        }
    });

    it('default nsteps produces 500 intervals', () => {
        expect(params.nsteps.values[0]).toBe(500);
    });

    it('plot_type defaults to Linear', () => {
        expect(params.plot_type.values[0]).toBe(PlotType.Linear);
    });

    it('anti defaults to neutrino (1)', () => {
        expect(params.anti.values[0]).toBe(1);
    });

    it('nu defaults to muon flavour (1)', () => {
        expect(params.nu.values[0]).toBe(1);
    });
});