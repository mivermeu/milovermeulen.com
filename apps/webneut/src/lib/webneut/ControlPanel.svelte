<script lang="ts">
    import { oscillationParameters, resetMixingParameters } from '$lib/webneut/state.svelte';
    import PresetDropdown from '$lib/webneut/PresetDropdown.svelte';
    import SliderAssembly from '$lib/webneut/SliderAssembly.svelte';
    import NeutrinoSelector from '$lib/webneut/NeutrinoSelector.svelte';
    import PlotTypeSelector from '$lib/webneut/PlotTypeSelector.svelte';
    import MassOrderingSelector from '$lib/webneut/MassOrderingSelector.svelte';
</script>

<div
    class="control-panel m-4 grid gap-4 select-none [grid-template-areas:'plot-controls_neutrino-controls'_'experiment-controls_neutrino-controls']"
>
    <div
        class="control-card self-start rounded-lg bg-brand-secondary p-4 [grid-area:plot-controls]"
    >
        <h3>Plot options</h3>
        <PlotTypeSelector />
        {#each [oscillationParameters.nsteps, oscillationParameters.animation_period] as parameter (parameter.label)}
            <SliderAssembly {parameter} />
        {/each}
    </div>
    <div
        class="control-card relative self-start rounded-lg bg-brand-secondary p-4 [grid-area:experiment-controls]"
    >
        <h3 class="flex justify-between">
            Experiment parameters
            <PresetDropdown />
        </h3>
        <NeutrinoSelector />
        {#each [oscillationParameters.E, oscillationParameters.L, oscillationParameters.rho] as parameter (parameter.label)}
            <SliderAssembly {parameter} action_buttons={true} />
        {/each}
    </div>
    <div
        class="control-card self-start rounded-lg bg-brand-secondary p-4 [grid-area:neutrino-controls]"
    >
        <h3 class="flex items-center justify-between">
            Neutrino mixing parameters
            <button class="text-sm font-normal" onclick={resetMixingParameters}>Reset</button>
        </h3>
        <MassOrderingSelector />
        {#each [oscillationParameters.th12, oscillationParameters.th23, oscillationParameters.th13, oscillationParameters.Dm21sq, oscillationParameters.Dm31sq, oscillationParameters.dCP] as parameter (parameter.label)}
            <SliderAssembly {parameter} action_buttons={true} />
        {/each}
    </div>
</div>

<style>
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
