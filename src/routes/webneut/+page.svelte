<script lang='ts'>
    import { exp, Matrix, pi, sin, cos, complex, matrix, multiply, conj, transpose, re, dotMultiply, range } from 'mathjs';
    import type { Complex, MathArray } from 'mathjs';
    import type { Parameter, OscillationParameters } from '$lib/webneut/types';
    import Plot from 'svelte-plotly.js';
    import RangeSlider from 'svelte-range-slider-pips';
    import ControlPanel from '$lib/webneut/ControlPanel.svelte';

    const sqrt2 = Math.sqrt(2);
    const light_speed: number = 299792458;  // In m/s.
    const hbar: number = 1.0545718e-34  // In Js.
    const reduced_fermi_constant: number = 4.5437957  // In J^-2.
    const electron_charge: number = 1.602e-19;  // In C.
    const nucleon_mass: number = 1.6726e-27  // In kg.

    const conv: number = 1e-6 / ((2 * hbar * light_speed) / electron_charge);  // Conversion factor from natural to useful units.
    const Gf: number = reduced_fermi_constant * Math.pow(light_speed * hbar, 2); // In m^2.

    let pars: OscillationParameters;
    $: pars = {
        nsteps: {
            values: [500],
            label: 'Number of points',
            snaps: [],
            precision: 0,
            limits: [1, 1000]
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
            snaps: [],
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
    }

    let s12: number;
    let s23: number;
    let s13: number;
    let c12: number;
    let c23: number;
    let c13: number;
    $: s12 = sin(pars.th12.values[0]);
    $: s23 = sin(pars.th23.values[0]);
    $: c12 = cos(pars.th12.values[0]);
    $: c23 = cos(pars.th23.values[0]);
    $: c13 = cos(pars.th13.values[0]);
    $: s13 = sin(pars.th13.values[0]);

    let chirality: number;
    $: chirality = pars.anti.values[0];

    let edcp: Complex;
    let emdcp: Complex;
    $: edcp = exp(complex(0, chirality * pars.dCP.values[0]));
    $: emdcp = exp(complex(0, -1 * chirality * pars.dCP.values[0]));

    let U1: Matrix;
    $: U1 = matrix([
        [1, 0, 0],
        [0, c23, s23],
        [0, -s23, c23]
    ]);

    let U2: Matrix;
    //@ts-ignore: Multiplication result in matrix
    $: U2 = matrix([
        [c13, 0, multiply(s13, emdcp)],
        [0, 1, 0],
        [multiply(-s13, edcp), 0, c13]
    ]);

    let U3: Matrix;
    $: U3 = matrix([
        [c12, s12, 0],
        [-s12, c12, 0],
        [0, 0, 1]
    ]);

    let U: Matrix;
    let Ud: Matrix;
    // @ts-ignore: Multiple multiplication
    $: U = multiply(U1, U2, U3);
    $: Ud = conj(transpose(U));

    let H: Matrix;
    $: H = matrix([
        [0, 0, 0],
        [0, pars.Dm21sq.values[0] * 1e-5, 0],
        [0, 0, pars.Dm31sq.values[0] * 1e-3]
    ]);

    let nuvec: number[] = [0, 0, 0];
    $: nuvec = nuvec.map((_, index) => index == pars.nu.values[0]? 1: 0 );

    let xValues: number[] 
    $: xValues = Array.from(
        { length: pars.nsteps.values[0] + 1 },
        (_, index) => pars.L.values[0] + index * (pars.L.values[1] - pars.L.values[0]) / pars.nsteps.values[0]
    );

    let yValues: number[][];

    // @ts-ignore: Convert object to array
    $: yValues = xValues.map(x => {
        let Hexp: Matrix = matrix([
            [1, 0, 0],
            [0, exp(complex(0, (-pars.Dm21sq.values[0] * 1e-5 * conv * x) / pars.E.values[0])), 0],
            [0, 0, exp(complex(0, (-pars.Dm31sq.values[0] * 1e-3 * conv * x) / pars.E.values[0]))]
        ]);

        const Ne = pars.rho.values[0] / nucleon_mass / 2; // Electron number density in m^-3.
        let V: Matrix = matrix([
            [chirality * sqrt2 * Gf * Ne * 1e3, 0, 0], // Multiply and convert to km^-1.
            [0, 0, 0],
            [0, 0, 0]
        ]);

        // @ts-ignore: Multiple multiplication
        let UHUdnu: MathArray = multiply(U, Hexp, Ud, nuvec).toArray();
        // @ts-ignore
        return re(dotMultiply(UHUdnu, conj(UHUdnu))).valueOf();
    }) 
    let realYValues: number[][];
    $: realYValues = transpose(yValues);

    $: data = [{
        x: xValues,
        y: realYValues[0]
    },
    {
        x: xValues,
        y: realYValues[1]
    },
    {
        x: xValues,
        y: realYValues[2]
    }];

    function update_parameters(event: CustomEvent) {
        pars = event.detail;
    }

</script>

<svelte:head>
    <title>Webneut</title>
    <meta name='WebNeut' content='Cool neutrino oscillator' />
</svelte:head>

<div class='webneut-tool'>
    <div class=header>
        <h1>Webneut</h1>
    </div>

    <div class='plot'>
        <Plot
            {data}
            layout={{ margin: { t: 0 } }}
            fillParent
        />
    </div>

    <div class='controls'>
        <ControlPanel parameters={pars} on:change={update_parameters}/>
    </div>
</div>

<style lang='scss'>
    .webneut-tool {
        margin: 0;
        height: 100vh;
        width: 100vw;

        display: grid;
        grid-template-columns: 1fr 3fr;
        grid-template-rows: auto  auto;
        grid-template-areas: 'header header'
                             'controls plot';
    }

    .header {
        margin: 0;
        grid-area: header;
    }

    .plot {
        margin: 0;
        grid-area: plot;
    }

    .controls {
        margin: 0;
        padding: 10px;
        grid-area: controls;
        overflow-y: auto;
    }
</style>