<script lang='ts'>
    import Plot from 'svelte-plotly.js';
    import type { Layout } from 'svelte-plotly.js';
    import type { Parameter } from '$lib/webneut/types';
    import ControlPanel from '$lib/webneut/ControlPanel.svelte';
    import { oscillation_parameters, x_values, y_values } from '$lib/webneut/stores';
    import DownloadButton from '$lib/webneut/DownloadButton.svelte';

    $: range_parameter = Object.values($oscillation_parameters).find(function (par: Parameter) {
        return par.values.length > 1;
    }) satisfies Parameter | undefined;

    $: nustr = $oscillation_parameters.anti.values[0] > 0 ? '\u03BD' : '\u03BD&#773;' satisfies string;
    $: fstr = $oscillation_parameters.nu.values[0] == 0 ? 'e' : $oscillation_parameters.nu.values[0] == 1 ? '\u03BC' : '\u03C4' satisfies string;

    $: layout = {
        font: { family: 'serif', size: 16 },
        xaxis: { title: { text: range_parameter ? range_parameter.label : '', standoff: 15 } },
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
            x: $x_values,
            y: $y_values[0],
            name: nustr + '<sub>e</sub>',
            line: {
                color: 'green'
            }
        },
        {
            x: $x_values,
            y: $y_values[1],
            name: nustr + '<sub>\u03BC</sub>',
            line: {
                color: 'blue'
            }
        },
        {
            x: $x_values,
            y: $y_values[2],
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
        <DownloadButton />
    </div>

    <div class='plot'>
        <Plot {data} {layout} fillParent />
    </div>

    <div class='controls'>
        <ControlPanel />
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

        display: flex;
        justify-content: space-between;
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
