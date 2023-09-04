<script lang='ts'>
    import Plot from 'svelte-plotly.js';
    import type { Layout } from 'svelte-plotly.js';
    import type { Parameter, OscillationParameters } from '$lib/webneut/types';
    import ControlPanel from '$lib/webneut/ControlPanel.svelte';
    import { default_oscillation_parameters, Oscillator } from '$lib/webneut/Oscillator';

    let oscillation_parameters: OscillationParameters = structuredClone(default_oscillation_parameters);

    let oscillator: Oscillator = new Oscillator(oscillation_parameters);
    let [xValues, yValues]: [number[], number[][]] = oscillator.oscillate();

    function update_parameters(event: CustomEvent) {
        [xValues, yValues] = oscillator.oscillate(oscillation_parameters);
    }

    $: range_parameter = Object.entries(oscillation_parameters).find(function ([key, par]: [string, Parameter]) {
        return par.values.length > 1;
    }) satisfies [string, Parameter] | undefined;

    $: nustr = oscillation_parameters.anti.values[0] > 0 ? '\u03BD' : '\u03BD&#773;' satisfies string;
    $: fstr = oscillation_parameters.nu.values[0] == 0 ? 'e' : oscillation_parameters.nu.values[0] == 1 ? '\u03BC' : '\u03C4' satisfies string;

    $: layout = {
        font: { family: 'serif', size: 16 },
        xaxis: { title: { text: range_parameter ? range_parameter[1].label : '', standoff: 15 } },
        title: {
            text: 'P(' + nustr + '<sub>' + fstr + '</sub>' + '\u2192' + nustr + '<sub>x</sub>)',
            x: 0,
            xanchor: 'left',
            yanchor: 'bottom',
            xref: 'paper',
            yref: 'paper'
        },
        showlegend: true,
        legend: {
            orientation: 'h',
            x: 1,
            y: 1,
            xanchor: 'right',
            yanchor: 'bottom'
        },
        margin: {
            b: 50,
            t: 20,
            l: 50,
            r: 30,
            pad: 5
        }
    } satisfies Partial<Layout>;

    $: data = [
        {
            x: xValues,
            y: yValues[0],
            name: nustr + '<sub>e</sub>',
            line: {
                color: 'green'
            }
        },
        {
            x: xValues,
            y: yValues[1],
            name: nustr + '<sub>\u03BC</sub>',
            line: {
                color: 'blue'
            }
        },
        {
            x: xValues,
            y: yValues[2],
            name: nustr + '<sub>\u03C4</sub>',
            line: {
                color: 'red'
            }
        }
    ];
</script>

<svelte:head>
    <title>Webneut</title>
    <meta name='WebNeut' content='Cool neutrino oscillator' />
</svelte:head>

<div class='webneut-tool'>
    <div class='header'>
        <h1>Webneut</h1>
    </div>

    <div class='plot'>
        <Plot {data} {layout} fillParent />
    </div>

    <div class='controls'>
        <ControlPanel bind:parameters={oscillation_parameters} on:change={update_parameters} />
    </div>
</div>

<style lang='scss'>
    .webneut-tool {
        margin: 0;
        height: 100vh;
        width: 100vw;

        display: grid;
        grid-template-columns: 1fr 3fr;
        grid-template-rows: auto auto;
        grid-template-areas:
            'header header'
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
