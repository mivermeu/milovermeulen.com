import { pi } from "mathjs";
import type { OscillationParameters } from "./types";
import { writable, type Writable } from "svelte/store";

export const oscillation_parameters: Writable<OscillationParameters> = writable({
    nsteps: {
        values: [1000],
        label: 'Number of points',
        snaps: [],
        precision: 0,
        limits: [1, 10000]
    },
    animspeed: {
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
});