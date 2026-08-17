const pi = Math.PI;
import { PlotType, type OscillationParameters } from './types';
import { browser } from '$app/environment';
import { initWasm, oscillate } from '../wasm/oscillator';

type MixingParameters = Pick<
    OscillationParameters,
    'th12' | 'th23' | 'th13' | 'Dm21sq' | 'Dm31sq' | 'dCP' | 'mass_ordering'
>;

function defaultMixingParameters(): MixingParameters {
    return {
        th12: {
            values: [0.5873],
            label: '\u03b8<sub>12</sub> [rad]',
            snaps: [0.5873, pi / 2],
            precision: 4,
            limits: [0, pi]
        },
        th23: {
            values: [0.8194],
            label: '\u03b8<sub>23</sub> [rad]',
            snaps: [0.8194, pi / 2],
            precision: 4,
            limits: [0, pi]
        },
        th13: {
            values: [0.1475],
            label: '\u03b8<sub>13</sub> [rad]',
            snaps: [0.1475, pi / 2, pi, (pi / 2) * 3],
            precision: 4,
            limits: [0, 2 * pi]
        },
        Dm21sq: {
            values: [7.5],
            label: '\u0394m<sub>21</sub><sup>2</sup> [10<sup>-5</sup> eV<sup>2</sup>]',
            snaps: [7.5],
            precision: 3,
            limits: [0, 10]
        },
        Dm31sq: {
            values: [2.527],
            label: '|\u0394m<sub>31</sub><sup>2</sup>| [10<sup>-3</sup> eV<sup>2</sup>]',
            snaps: [2.527],
            precision: 3,
            limits: [0, 5]
        },
        dCP: {
            values: [-2.583],
            label: '\u03b4<sub>CP</sub> [rad]',
            snaps: [-2.583, 0, pi / 2, -pi / 2],
            precision: 3,
            limits: [-pi, pi]
        },
        mass_ordering: {
            values: [1],
            label: 'Mass ordering',
            snaps: [],
            precision: 0,
            limits: [-1, 1]
        }
    };
}

let activeTween: (() => void) | undefined;

function tweenValues(
    targets: Record<string, number>,
    duration: number,
    targets1?: Record<string, number>
) {
    if (activeTween) activeTween();
    const entries = Object.entries(targets) as [string, number][];
    const startValues: Record<string, number> = {};
    const startValues1: Record<string, number> = {};
    for (const [key] of entries) {
        startValues[key] = oscillationParameters[key].values[0];
        if (targets1?.[key] !== undefined) {
            startValues1[key] = oscillationParameters[key].values[1];
        }
    }
    let cancelled = false;
    activeTween = () => {
        cancelled = true;
    };
    const startTime = performance.now();
    const tick = () => {
        if (cancelled) return;
        const t = Math.min((performance.now() - startTime) / duration, 1);
        const ease = 1 - (1 - t) * (1 - t);
        for (const [key, target] of entries) {
            oscillationParameters[key].values[0] =
                startValues[key] + (target - startValues[key]) * ease;
            if (targets1?.[key] !== undefined) {
                oscillationParameters[key].values[1] =
                    startValues1[key] + (targets1[key] - startValues1[key]) * ease;
            }
        }
        if (t < 1) requestAnimationFrame(tick);
        else activeTween = undefined;
    };
    requestAnimationFrame(tick);
}

export function resetMixingParameters() {
    const defaults = defaultMixingParameters();
    const targets: Record<string, number> = {};
    for (const key of Object.keys(defaults) as (keyof MixingParameters)[]) {
        const param = oscillationParameters[key];
        if (key === 'mass_ordering') {
            param.values[0] = defaults[key].values[0];
            continue;
        }
        if (param.values.length > 1) continue;
        targets[key] = defaults[key].values[0];
    }
    tweenValues(targets, 700);
}

export type Preset = {
    name: string;
    description: string;
    nu: number;
    anti: number;
    E: number | [number, number];
    L: number | [number, number];
    rho: number;
};

export const experimentPresets: Preset[] = [
    {
        name: 'Default',
        description: '',
        nu: 1,
        anti: 1,
        E: 1,
        L: [0, 33060],
        rho: 0
    },
    {
        name: 'Solar',
        description: 'Solar neutrinos (Boron-8)',
        nu: 0,
        anti: 1,
        E: [0.001, 20],
        L: 150000000,
        rho: 0
    },
    {
        name: 'Atmospheric',
        description: 'Atmospheric neutrinos',
        nu: 1,
        anti: 1,
        E: 1,
        L: [15, 13000],
        rho: 2600
    },
    {
        name: 'K2K',
        description: '250 km baseline, 1.3 GeV peak',
        nu: 1,
        anti: 1,
        E: [0.001, 3],
        L: 250,
        rho: 2600
    },
    {
        name: 'KamLAND',
        description: 'Reactor, 180 km baseline',
        nu: 0,
        anti: -1,
        E: [0.002, 0.01],
        L: 180,
        rho: 0
    },
    {
        name: 'MINOS',
        description: '735 km baseline, 3 GeV peak',
        nu: 1,
        anti: 1,
        E: [3, 10],
        L: 735,
        rho: 2800
    },
    {
        name: 'T2K',
        description: '295 km baseline, 0.6 GeV peak',
        nu: 1,
        anti: 1,
        E: [0.4, 1.5],
        L: 295,
        rho: 2600
    },
    {
        name: 'Daya Bay',
        description: 'Reactor, 1.6 km baseline',
        nu: 0,
        anti: -1,
        E: [0.002, 0.01],
        L: 1.6,
        rho: 0
    },
    {
        name: 'RENO',
        description: 'Reactor, 1.4 km baseline',
        nu: 0,
        anti: -1,
        E: [0.002, 0.01],
        L: 1.4,
        rho: 0
    },
    {
        name: 'NOVA',
        description: '810 km baseline, 2 GeV peak',
        nu: 1,
        anti: 1,
        E: [1, 5],
        L: 810,
        rho: 2850
    },
    {
        name: 'DUNE',
        description: '1300 km baseline, 2.5 GeV peak',
        nu: 1,
        anti: 1,
        E: [0.5, 10],
        L: 1300,
        rho: 2850
    }
];

export function applyPreset(preset: Preset) {
    const startE = oscillationParameters.E.values[0];
    const startE1 =
        oscillationParameters.E.values.length > 1 ? oscillationParameters.E.values[1] : startE;
    const startL = oscillationParameters.L.values[0];
    const startL1 =
        oscillationParameters.L.values.length > 1 ? oscillationParameters.L.values[1] : startL;
    const startRho = oscillationParameters.rho.values[0];

    if (oscillationParameters.E.values.length > 1)
        oscillationParameters.E.values = [oscillationParameters.E.values[1]];
    if (oscillationParameters.L.values.length > 1)
        oscillationParameters.L.values = [oscillationParameters.L.values[1]];

    oscillationParameters.nu.values[0] = preset.nu;
    oscillationParameters.anti.values[0] = preset.anti;

    const targetE = Array.isArray(preset.E) ? [preset.E[0], preset.E[1]] : [preset.E];
    const targetL = Array.isArray(preset.L) ? [preset.L[0], preset.L[1]] : [preset.L];

    oscillationParameters.E.values = targetE;
    oscillationParameters.L.values = targetL;
    oscillationParameters.E.values[0] = startE;
    oscillationParameters.L.values[0] = startL;
    if (targetE.length > 1) oscillationParameters.E.values[1] = startE1;
    if (targetL.length > 1) oscillationParameters.L.values[1] = startL1;
    oscillationParameters.rho.values[0] = startRho;

    const targets1: Record<string, number> = {};
    if (targetE.length > 1) targets1.E = targetE[1];
    if (targetL.length > 1) targets1.L = targetL[1];
    tweenValues({ E: targetE[0], L: targetL[0], rho: preset.rho }, 500, targets1);
}

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
            values: [10],
            label: 'Animation period [s]',
            snaps: [],
            precision: 1,
            limits: [1, 40]
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
            precision: 4,
            limits: [0.001, 20]
        },
        L: {
            values: [0, 33060],
            label: 'Path length [km]',
            snaps: [],
            precision: 0,
            limits: [0, 40000]
        },
        rho: {
            values: [0],
            label: '\u03c1 [kg/m<sup>3</sup>]',
            snaps: [2600],
            precision: 0,
            limits: [0, 10000]
        },
        ...defaultMixingParameters()
    };
}

export const oscillationParameters: OscillationParameters = $state(defaultParameters());
export const plotData = $state({ x: [] as number[], y: [] as number[][] });
export const animatingParameter = $state({
    current: undefined as import('./types').Parameter | undefined
});

let ready = false;
let pending: OscillationParameters | undefined;

if (browser) {
    initWasm().then(() => {
        ready = true;
        if (pending) run(pending);
    });
}

function run(params: OscillationParameters) {
    const [x, y] = oscillate(params);
    plotData.x = x;
    plotData.y = y;
}

export function recompute() {
    for (const p of Object.values(oscillationParameters)) {
        void p.values.length;
        void p.values[0];
        if (p.values.length > 1) void p.values[1];
    }
    const params = $state.snapshot(oscillationParameters);
    if (!ready) {
        pending = params;
        return;
    }
    run(params);
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
