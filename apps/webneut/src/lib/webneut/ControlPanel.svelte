<script lang='ts'>
    import { animating_parameter, oscillation_parameters, x_values, y_values } from '$lib/webneut/stores';
    import SliderAssembly from '$lib/webneut/SliderAssembly.svelte';
    import NeutrinoSelector from '$lib/webneut/NeutrinoSelector.svelte';
    import { Oscillator } from '$lib/webneut/Oscillator';
    import type { Unsubscriber } from 'svelte/store';
    import { onDestroy } from 'svelte';
    import PlotTypeSelector from '$lib/webneut/PlotTypeSelector.svelte';

    let oscillator: Oscillator = new Oscillator($oscillation_parameters);
    [$x_values, $y_values] = oscillator.oscillate();
    const update_unsubscribe: Unsubscriber = oscillation_parameters.subscribe(parameters => {
        [$x_values, $y_values] = oscillator.oscillate(parameters);
    });

    $: animation_period = $oscillation_parameters.animation_period.values[0] satisfies number;

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
</script>

<div class='control-panel'>
    <div class='control-card' style="grid-area: plot-controls;">
        <h3>Plot options</h3>
        <PlotTypeSelector />
        {#each [
            $oscillation_parameters.nsteps,
            $oscillation_parameters.animation_period
        ] as parameter}
            <SliderAssembly bind:parameter={parameter} />
        {/each}
    </div>
    <div class='control-card' style="grid-area: experiment-controls;">
        <h3>Experiment parameters</h3>
        <NeutrinoSelector />
        {#each [$oscillation_parameters.E, $oscillation_parameters.L, $oscillation_parameters.rho] as parameter}
            <SliderAssembly bind:parameter={parameter} action_buttons={true} />
        {/each}
    </div>
    <div class='control-card' style="grid-area: neutrino-controls;">
        <h3>Neutrino mixing parameters</h3>
        {#each [
            $oscillation_parameters.th12,
            $oscillation_parameters.th23,
            $oscillation_parameters.th13,
            $oscillation_parameters.Dm21sq,
            $oscillation_parameters.Dm31sq,
            $oscillation_parameters.dCP,
        ] as parameter}
            <SliderAssembly bind:parameter={parameter} action_buttons={true} />
        {/each}
    </div>
</div>

<style>
    .control-panel {
        display: grid;
        grid-template-areas:
            'plot-controls neutrino-controls'
            'experiment-controls neutrino-controls';
        gap: 1em;
        margin: 1em;
        -webkit-user-select: none;
        -ms-user-select: none;
        user-select: none;
    }

    .control-card {
        background-color: #333;
        padding: 1em;
        border-radius: 0.5em;
        align-self: start;
    }

    @container (max-width: 600px) {
        .control-panel {
            grid-template-areas:
                'plot-controls'
                'experiment-controls'
                'neutrino-controls';
        }
    }

    @container (max-width: 500px) {
        .control-panel {
            margin: 0;
        }
        .control-card {
            margin: 0;
            padding: 0.5em;
            border-radius: 0;
        }
    }
</style>