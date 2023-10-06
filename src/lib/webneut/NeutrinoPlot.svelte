<script lang="ts">
    import Plot from 'svelte-plotly.js';
    import type { Layout, Data } from 'svelte-plotly.js';
    import { oscillation_parameters, x_values, y_values } from './stores';
    import { PlotType, type Parameter } from './types';

    $: range_parameter = Object.values($oscillation_parameters).find(function (par: Parameter) {
        return par.values.length > 1;
    }) satisfies Parameter | undefined;

    $: nustr = $oscillation_parameters.anti.values[0] > 0 ? '\u03BD' : '\u03BD&#773;' satisfies string;
    $: fstr = $oscillation_parameters.nu.values[0] == 0 ? 'e' : $oscillation_parameters.nu.values[0] == 1 ? '\u03BC' : '\u03C4' satisfies string;

    $: linear_layout = {
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
            yanchor: 'bottom',
            font: { family: 'serif', size: 20 }
        },
        margin: {
            b: 80,
            t: 80,
            l: 50,
            r: 30,
            pad: 5
        }
    } satisfies Partial<Layout>;

    function makeTernAxis(title: string, tickangle: number) {
        return {
            title: title,
            titlefont: { size: 20 },
            tickangle: tickangle,
            tickfont: { size: 15 },
            tickcolor: "rgba(0,0,0,0)",
            ticklen: 5,
            showline: true,
            showgrid: true,
        };
    }

    $: ternary_layout = {
        ternary: {
            sum: 1,
            aaxis: makeTernAxis(nustr + "<sub>e</sub>", 0),
            baxis: makeTernAxis(nustr + "<sub>\u03BC</sub>", 45),
            caxis: makeTernAxis(nustr + "<sub>\u03C4</sub>", -45),
        },
        margin: {
            l: 40,
            r: 40,
            b: 50,
            t: 50,
        },
        font: {
            family: "serif"
        }
    } satisfies Partial<Layout>

    $: linear_data = [
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
    ] satisfies Data[];

    $: ternary_data = [{
        type: "scatterternary",
        mode: "lines",
        // It would be extremely nice to have a colour gradient in this line, but this is currently impossible in Plotly.
        // line: {
        //   color: $x_values
        // },

        // @ts-ignore: Unrecognised elements.
        a: $y_values[0],
        b: $y_values[1],
        c: $y_values[2],
    }] satisfies Data[];

    $: data = $oscillation_parameters.plot_type.values[0] === PlotType.Linear? linear_data: ternary_data satisfies Data[];
    $: layout = $oscillation_parameters.plot_type.values[0] === PlotType.Linear? linear_layout: ternary_layout;
</script>

<Plot {data} {layout} fillParent />