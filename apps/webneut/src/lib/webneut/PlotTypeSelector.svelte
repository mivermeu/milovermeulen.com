<script lang="ts">
    import { oscillationParameters } from '$lib/webneut/state.svelte';
    import { PLOT_TYPES } from '$lib/webneut/constants';
    import PanelSwitch from '$lib/webneut/PanelSwitch.svelte';

    let plotSelected = $state(oscillationParameters.plot_type.values[0]);

    $effect(() => {
        oscillationParameters.plot_type.values[0] = plotSelected;
    });
</script>

<div class="my-4 grid grid-cols-2 gap-2">
    {#each PLOT_TYPES as plotType (plotType.value)}
        <PanelSwitch bind:group={plotSelected} value={plotType.value}>
            {plotType.name}
        </PanelSwitch>
    {/each}
</div>
