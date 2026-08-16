<script lang="ts">
    import { oscillationParameters } from '$lib/webneut/state.svelte';
    import { MASS_ORDERING_OPTIONS } from '$lib/webneut/constants';
    import PanelSwitch from '$lib/webneut/PanelSwitch.svelte';

    let orderingSelected = $state(oscillationParameters.mass_ordering.values[0]);

    $effect(() => {
        oscillationParameters.mass_ordering.values[0] = orderingSelected;
    });
</script>

<div class="my-4 grid grid-cols-2 gap-2">
    {#each MASS_ORDERING_OPTIONS as option (option.value)}
        <PanelSwitch bind:group={orderingSelected} value={option.value}>
            {option.name}
        </PanelSwitch>
    {/each}
</div>
