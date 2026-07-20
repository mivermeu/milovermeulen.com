<script lang="ts">
    import { oscillationParameters } from '$lib/webneut/state.svelte';
    import SliderAssembly from '$lib/webneut/SliderAssembly.svelte';
    import NeutrinoSelector from '$lib/webneut/NeutrinoSelector.svelte';
    import PlotTypeSelector from '$lib/webneut/PlotTypeSelector.svelte';
</script>

<div class="control-panel">
    <div class="control-card" style="grid-area: plot-controls;">
        <h3>Plot options</h3>
        <PlotTypeSelector />
        {#each [oscillationParameters.nsteps, oscillationParameters.animation_period] as parameter}
            <SliderAssembly bind:parameter />
        {/each}
    </div>
    <div class="control-card" style="grid-area: experiment-controls;">
        <h3>Experiment parameters</h3>
        <NeutrinoSelector />
        {#each [oscillationParameters.E, oscillationParameters.L, oscillationParameters.rho] as parameter}
            <SliderAssembly bind:parameter action_buttons={true} />
        {/each}
    </div>
    <div class="control-card" style="grid-area: neutrino-controls;">
        <h3>Neutrino mixing parameters</h3>
        {#each [oscillationParameters.th12, oscillationParameters.th23, oscillationParameters.th13, oscillationParameters.Dm21sq, oscillationParameters.Dm31sq, oscillationParameters.dCP] as parameter}
            <SliderAssembly bind:parameter action_buttons={true} />
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
