<script lang='ts'>
    import { oscillation_parameters } from './stores';
    import SliderAssembly from './SliderAssembly.svelte';
    import NeutrinoSelector from './NeutrinoSelector.svelte';
</script>

<div class='control-panel'>
    {#each [
        $oscillation_parameters.nsteps,
        $oscillation_parameters.animation_period
    ] as parameter}
        <SliderAssembly bind:parameter={parameter} />
    {/each}
    <NeutrinoSelector />
    {#each [
        $oscillation_parameters.E,
        $oscillation_parameters.L,
        $oscillation_parameters.th12,
        $oscillation_parameters.th23,
        $oscillation_parameters.th13,
        $oscillation_parameters.Dm21sq,
        $oscillation_parameters.Dm31sq,
        $oscillation_parameters.dCP,
        $oscillation_parameters.rho,
    ] as parameter}
        <SliderAssembly bind:parameter={parameter} action_buttons={true} />
    {/each}
</div>

<style lang="scss">
    .control-panel {
        border: solid white;
        border-radius: 5px;
        padding: 10px;
    }
</style>
