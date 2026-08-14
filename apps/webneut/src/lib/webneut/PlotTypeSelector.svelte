<script lang="ts">
    import { PlotType } from '$lib/webneut/types';
    import { oscillationParameters } from '$lib/webneut/state.svelte';

    const plotTypes = $derived(
        Object.entries(PlotType).filter((entry) => isNaN(Number(entry[0]))) as [
            string,
            string | PlotType
        ][]
    );

    let plotSelected = $state(oscillationParameters.plot_type.values[0] as PlotType);

    function update() {
        oscillationParameters.plot_type.values[0] = plotSelected;
    }
</script>

<div class="my-4 flex flex-col gap-2">
    <div>Plot type</div>
    {#each plotTypes as [name, value], i}
        <label class="flex items-center gap-2">
            <input
                type="radio"
                bind:group={plotSelected}
                {value}
                name="plot_type"
                onchange={update}
            />
            {name}
        </label>
    {/each}
</div>