<script lang="ts">
    import { oscillationParameters } from '$lib/webneut/state.svelte';
    import { NEUTRINO_OPTIONS } from '$lib/webneut/constants';
    import PanelSwitch from '$lib/webneut/PanelSwitch.svelte';

    let nuSelected = $state(
        oscillationParameters.anti.values[0] < 0
            ? oscillationParameters.nu.values[0] + 3
            : oscillationParameters.nu.values[0]
    );

    $effect(() => {
        const option = NEUTRINO_OPTIONS[nuSelected];
        oscillationParameters.nu.values[0] = option.nu;
        oscillationParameters.anti.values[0] = option.anti;
    });

    $effect(() => {
        const nu = oscillationParameters.nu.values[0];
        const anti = oscillationParameters.anti.values[0];
        nuSelected = anti < 0 ? nu + 3 : nu;
    });
</script>

<div class="my-4 grid grid-cols-3 gap-2">
    {#each NEUTRINO_OPTIONS as option, i (i)}
        <PanelSwitch bind:group={nuSelected} value={i}>
            {#if option.anti < 0}
                ν̄<sub>{option.flavor}</sub>
            {:else}
                ν<sub>{option.flavor}</sub>
            {/if}
        </PanelSwitch>
    {/each}
</div>
