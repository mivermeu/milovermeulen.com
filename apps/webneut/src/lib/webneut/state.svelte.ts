import { pi } from 'mathjs';
import { PlotType, type OscillationParameters } from './types';
import { Oscillator } from './Oscillator';

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
            values: [1000],
            label: 'Number of points',
            snaps: [],
            precision: 0,
            limits: [50, 2000]
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

export const oscillationParameters: OscillationParameters = $state(defaultParameters());
export const plotData = $state({ x: [] as number[], y: [] as number[][] });
export const animatingParameter = $state({
    current: undefined as import('./types').Parameter | undefined
});

const oscillator = new Oscillator(oscillationParameters);

export function recompute() {
    for (const p of Object.values(oscillationParameters)) {
        void p.values.length;
        void p.values[0];
        if (p.values.length > 1) void p.values[1];
    }
    const params = $state.snapshot(oscillationParameters);
    const [x, y] = oscillator.oscillate(params);
    plotData.x = x;
    plotData.y = y;
}

export function makeRange(param: import('./types').Parameter) {
    for (const oscParam of Object.values(oscillationParameters)) {
        if (oscParam.values.length > 1) {
            oscParam.values = [oscParam.values[1]];
        }
    }
    param.values = param.values[0] > 0 ? [0, param.values[0]] : [param.values[0], 0];
}

$effect.root(() => {
    $effect(recompute);

    $effect(() => {
        const param = animatingParameter.current;
        if (!param) return;

        const startValue = param.values[0];
        const startTime = Date.now();
        const period = oscillationParameters.animation_period.values[0];

        let frame = 0;
        const tick = () => {
            const progress = ((Date.now() - startTime) / (period * 1000)) % 1;
            let newValue = startValue + progress * (param.limits[1] - param.limits[0]);
            while (newValue > param.limits[1]) {
                newValue -= param.limits[1] - param.limits[0];
            }
            param.values[0] = newValue;
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(frame);
    });
});
