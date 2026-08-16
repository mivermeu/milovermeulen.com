<script lang="ts">
    import { browser } from '$app/environment';
    import Plot from 'svelte-plotly.js';
    import type { Layout, Data } from 'svelte-plotly.js';
    import { oscillationParameters, plotData, animatingParameter } from '$lib/webneut/state.svelte';
    import { PlotType, type Parameter } from '$lib/webneut/types';

    let width = $state(browser ? window.innerWidth : 1024);

    $effect(() => {
        if (!browser) return;
        const handler = () => (width = window.innerWidth);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    });

    const lineWidth = $derived(width < 768 ? 1 : 2);

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
            title: { text: title, font: { size: 16 } },
            tickangle,
            tickfont: { size: 13 },
            tickcolor: 'rgba(221, 221, 221, 0.3)',
            gridcolor: 'rgba(221, 221, 221, 0.1)',
            linecolor: 'rgba(221, 221, 221, 0.3)',
            color: 'rgba(221, 221, 221, 0.8)',
            ticklen: 5,
            showline: true,
            showgrid: true
        };
    }

    function lerp(a: number, b: number, t: number) {
        return a + (b - a) * t;
    }

    const GRADIENT: [number, number, number][] = [
        [80, 140, 240],
        [50, 200, 220],
        [170, 225, 120],
        [250, 220, 80]
    ];

    const colorscale: [number, string][] = GRADIENT.map(([r, g, b], i) => [
        i / (GRADIENT.length - 1),
        `rgb(${r},${g},${b})`
    ]);

    function gradientColor(t: number): string {
        t = Math.min(1, Math.max(0, t));
        const segments = GRADIENT.length - 1;
        const segment = Math.min(Math.floor(t * segments), segments - 1);
        const local = t * segments - segment;
        const from = GRADIENT[segment];
        const to = GRADIENT[segment + 1];
        return `rgb(${Math.round(lerp(from[0], to[0], local))},${Math.round(lerp(from[1], to[1], local))},${Math.round(lerp(from[2], to[2], local))})`;
    }

    const isLinear = $derived(oscillationParameters.plot_type.values[0] === PlotType.Linear);

    const animationAnnotation = $derived.by(() => {
        const param = animatingParameter.current;
        if (!param) return [];
        return [
            {
                text: `${param.label} = ${param.values[0].toFixed(param.precision)}`,
                x: 0.4,
                y: 1.01,
                xref: 'paper',
                yref: 'paper',
                xanchor: 'right',
                yanchor: 'bottom',
                showarrow: false,
                font: { color: '#ff6900', size: 14 },
                bgcolor: 'rgba(34, 34, 34, 0.8)',
                borderpad: 4
            }
        ] as Partial<Layout>['annotations'];
    });

    const darkPlot = {
        paper_bgcolor: '#222',
        plot_bgcolor: '#222',
        uirevision: '1',
        font: {
            family: '"AtkinsonHyperlegibleMono", ui-monospace, monospace',
            color: 'rgba(221, 221, 221, 0.8)',
            size: 14
        }
    };

    const data = $derived.by(() => {
        if (!isLinear) {
            const pe = plotData.y[0];
            const pmu = plotData.y[1];
            const ptau = plotData.y[2];
            const n = plotData.x.length;
            const x0 = plotData.x[0];
            const x1 = plotData.x[n - 1];
            const segs = Math.min(50, n - 1);
            const traces = [];

            for (let s = 0; s < segs; s++) {
                const start = Math.floor((s * (n - 1)) / segs);
                const end = Math.floor(((s + 1) * (n - 1)) / segs);
                const t =
                    x1 === x0 ? 0 : (plotData.x[Math.floor((start + end) / 2)] - x0) / (x1 - x0);
                traces.push({
                    type: 'scatterternary' as const,
                    mode: 'lines' as const,
                    a: pe.slice(start, end + 1),
                    b: pmu.slice(start, end + 1),
                    c: ptau.slice(start, end + 1),
                    line: { color: gradientColor(t), width: lineWidth },
                    hoverinfo: 'skip' as const,
                    showlegend: false
                });
            }

            traces.push({
                type: 'scatterternary' as const,
                mode: 'markers' as const,
                a: [pe[0]],
                b: [pmu[0]],
                c: [ptau[0]],
                marker: {
                    color: [x0, x1],
                    colorscale,
                    showscale: true,
                    cmin: x0,
                    cmax: x1,
                    colorbar: {
                        title: { text: rangeParameter ? rangeParameter.label : '' },
                        orientation: 'h',
                        thickness: 16,
                        len: 0.7,
                        x: 0.5,
                        y: -0.15,
                        xanchor: 'center',
                        yanchor: 'bottom'
                    },
                    size: 0
                },
                hoverinfo: 'skip' as const,
                showlegend: false
            });

            return traces as unknown as Data[];
        }

        return [
            {
                x: plotData.x,
                y: plotData.y[0],
                name: nustr + '<sub>e</sub>',
                line: { color: '#4ade80', width: lineWidth }
            },
            {
                x: plotData.x,
                y: plotData.y[1],
                name: nustr + '<sub>\u03BC</sub>',
                line: { color: '#60a5fa', width: lineWidth }
            },
            {
                x: plotData.x,
                y: plotData.y[2],
                name: nustr + '<sub>\u03C4</sub>',
                line: { color: '#f87171', width: lineWidth }
            }
        ] satisfies Data[];
    });

    const layout = $derived.by((): Partial<Layout> => {
        if (!isLinear) {
            return {
                ...darkPlot,
                ternary: {
                    sum: 1,
                    bgcolor: '#222',
                    aaxis: makeTernAxis(nustr + '<sub>e</sub>', 0),
                    baxis: makeTernAxis(nustr + '<sub>\u03BC</sub>', 45),
                    caxis: makeTernAxis(nustr + '<sub>\u03C4</sub>', -45)
                },
                annotations: animationAnnotation,
                margin: { l: 40, r: 40, b: 90, t: 50 }
            };
        }

        return {
            ...darkPlot,
            xaxis: {
                title: {
                    text: rangeParameter ? rangeParameter.label : '',
                    standoff: 15
                },
                gridcolor: 'rgba(221, 221, 221, 0.15)',
                linecolor: 'rgba(221, 221, 221, 0.3)'
            },
            yaxis: {
                range: [0, 1],
                gridcolor: 'rgba(221, 221, 221, 0.15)',
                linecolor: 'rgba(221, 221, 221, 0.3)'
            },
            title: {
                text: 'P(' + nustr + '<sub>' + fstr + '</sub>' + '\u2192' + nustr + '<sub>x</sub>)',
                x: 0,
                xanchor: 'left',
                yanchor: 'bottom',
                xref: 'paper',
                yref: 'paper'
            },
            annotations: animationAnnotation,
            showlegend: true,
            legend: {
                orientation: 'h',
                x: 1,
                y: 1,
                xanchor: 'right',
                yanchor: 'bottom',
                bgcolor: 'rgba(0, 0, 0, 0)',
                font: { color: 'rgba(221, 221, 221, 0.8)', size: 12 }
            },
            margin: { b: 60, t: 30, l: 40, r: 20, pad: 5 }
        };
    });
</script>

<Plot {data} {layout} fillParent />
