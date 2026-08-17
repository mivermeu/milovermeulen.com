<script lang="ts">
    import {
        oscillationParameters,
        resetMixingParameters,
        experimentPresets,
        applyPreset
    } from '$lib/webneut/state.svelte';
    import SliderAssembly from '$lib/webneut/SliderAssembly.svelte';
    import NeutrinoSelector from '$lib/webneut/NeutrinoSelector.svelte';
    import PlotTypeSelector from '$lib/webneut/PlotTypeSelector.svelte';
    import MassOrderingSelector from '$lib/webneut/MassOrderingSelector.svelte';

    let presetsOpen = $state(false);
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
            <button class="px-2 py-0.5 text-sm" onclick={() => (presetsOpen = !presetsOpen)}
                >Preset</button
            >
        </h3>
        {#if presetsOpen}
            <div
                class="presets absolute top-13 right-4 z-10 flex flex-col gap-1 rounded-lg border border-brand-primary bg-brand-secondary p-2"
            >
                {#each experimentPresets as preset (preset.name)}
                    <button
                        class="w-full justify-start border-none"
                        onclick={() => {
                            applyPreset(preset);
                            presetsOpen = false;
                        }}
                    >
                        <span class="font-medium">{preset.name}</span>
                        <span class="ml-2 text-xs opacity-60">{preset.description}</span>
                    </button>
                {/each}
            </div>
        {/if}
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
            <button class="px-2 py-0.5 text-sm" onclick={resetMixingParameters}>Reset</button>
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
