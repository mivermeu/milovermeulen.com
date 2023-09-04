<script lang='ts'>
    import { createEventDispatcher, type EventDispatcher } from 'svelte';
    import type { Parameter, OscillationParameters } from '$lib/webneut/types';
    import SliderAssembly from './SliderAssembly.svelte';
    import NeutrinoSelector from './NeutrinoSelector.svelte';

    export let parameters: OscillationParameters;

    let dispatch: EventDispatcher<{change: OscillationParameters}> = createEventDispatcher<{change: OscillationParameters}>();

    let continuous_neutrino_parameters: Parameter[] = [
        parameters.E,
        parameters.L,
        parameters.th12,
        parameters.th23,
        parameters.th13,
        parameters.Dm21sq,
        parameters.Dm31sq,
        parameters.dCP,
        parameters.rho,
    ]

    function notify() {
        dispatch('change', parameters);
    }
</script>

<div class='control-panel'>
    <SliderAssembly bind:parameter={parameters.nsteps} on:change={notify} />
    <NeutrinoSelector bind:anti_parameter={parameters.anti} bind:nu_parameter={parameters.nu} on:change={notify}/>
    {#each continuous_neutrino_parameters as parameter}
        <SliderAssembly bind:parameter={parameter} on:change={notify}/>
    {/each}
</div>

<style lang="scss">
    .control-panel {
        border: solid white;
        border-radius: 5px;
        padding: 10px;
    }
</style>
