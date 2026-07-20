<script lang="ts">
    import Plot from 'svelte-plotly.js';
    import type { Layout, Data } from 'svelte-plotly.js';
    import { oscillationParameters, plotData } from '$lib/webneut/state.svelte';
    import { PlotType, type Parameter } from '$lib/webneut/types';

    const rangeParameter = $derived(
        Object.values(oscillationParameters).find((par: Parameter) => par.values.length > 1) as
            Parameter | undefined
    );

    const nustr = $derived(oscillationParameters.anti.values[0] > 0 ? '\u03BD' : '\u03BD&#773;');
    const fstr = $derived(
        oscillationParameters.nu.values[0] == 0
            ? 'e'
            : oscillationParameters.nu.values[0] == 1
              ? '\u03BC'
              : '\u03C4'
    );

    function makeTernAxis(title: string, tickangle: number) {
        return {
            title,
            titlefont: { size: 20 },
            tickangle,
            tickfont: { size: 15 },
            tickcolor: 'rgba(0,0,0,0)',
            ticklen: 5,
            showline: true,
            showgrid: true
        };
    }

    const isLinear = $derived(oscillationParameters.plot_type.values[0] === PlotType.Linear);

    const data = $derived.by(() => {
        if (!isLinear) {
            return [
                {
                    type: 'scatterternary' as const,
                    mode: 'lines' as const,
                    a: plotData.y[0],
                    b: plotData.y[1],
                    c: plotData.y[2]
                }
            ] as Data[];
        }

        return [
            {
                x: plotData.x,
                y: plotData.y[0],
                name: nustr + '<sub>e</sub>',
                line: { color: 'green' }
            },
            {
                x: plotData.x,
                y: plotData.y[1],
                name: nustr + '<sub>\u03BC</sub>',
                line: { color: 'blue' }
            },
            {
                x: plotData.x,
                y: plotData.y[2],
                name: nustr + '<sub>\u03C4</sub>',
                line: { color: 'red' }
            }
        ] satisfies Data[];
    });

    const layout = $derived.by((): Partial<Layout> => {
        if (!isLinear) {
            return {
                ternary: {
                    sum: 1,
                    aaxis: makeTernAxis(nustr + '<sub>e</sub>', 0),
                    baxis: makeTernAxis(nustr + '<sub>\u03BC</sub>', 45),
                    caxis: makeTernAxis(nustr + '<sub>\u03C4</sub>', -45)
                },
                margin: { l: 40, r: 40, b: 50, t: 50 },
                font: { family: 'serif' }
            };
        }

        return {
            font: { family: 'serif', size: 16 },
            xaxis: {
                title: {
                    text: rangeParameter ? rangeParameter.label : '',
                    standoff: 15
                }
            },
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
                yanchor: 'bottom',
                font: { family: 'serif', size: 20 }
            },
            margin: { b: 60, t: 30, l: 40, r: 20, pad: 5 }
        };
    });
</script>

<Plot {data} {layout} fillParent />
