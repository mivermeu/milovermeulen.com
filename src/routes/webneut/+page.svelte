<script lang='ts'>
    import Plot from 'svelte-plotly.js';
    import type { Layout } from 'svelte-plotly.js';
    import type { Parameter } from '$lib/webneut/types';
    import ControlPanel from '$lib/webneut/ControlPanel.svelte';
    import { Oscillator } from '$lib/webneut/Oscillator';
    import { animating_parameter, oscillation_parameters, x_values, y_values } from '$lib/webneut/stores';
    import type { Unsubscriber } from 'svelte/store';
    import { onDestroy } from 'svelte';
    import DownloadButton from '$lib/webneut/DownloadButton.svelte';

    let oscillator: Oscillator = new Oscillator($oscillation_parameters);
    [$x_values, $y_values] = oscillator.oscillate();
    const update_unsubscribe: Unsubscriber = oscillation_parameters.subscribe(parameters => {
        [$x_values, $y_values] = oscillator.oscillate(parameters);
    });

    $: animation_period = $oscillation_parameters.animation_period.values[0] satisfies number;

    // Animation.
    let interval: number;
    const animate_unsubscribe: Unsubscriber = animating_parameter.subscribe((parameter) => {
        window.clearInterval(interval);
        if(parameter != undefined) {
            const start_value: number = parameter.values[0];
            const start_time: number = Date.now();
            interval = window.setInterval(() => {
                const progress_fraction: number = ((Date.now() - start_time) / (animation_period * 1000)) % 1;
                let new_value: number = start_value + progress_fraction * (parameter.limits[1] - parameter.limits[0]);
                while (new_value > parameter.limits[1]) {
                    new_value -= (parameter.limits[1] - parameter.limits[0]);
                }
                parameter.values[0] = new_value;
                $oscillation_parameters = $oscillation_parameters;
            });
        }
    });

    onDestroy(() => {
        update_unsubscribe();
        animate_unsubscribe();
    });

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
