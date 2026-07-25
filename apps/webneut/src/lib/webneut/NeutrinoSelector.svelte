<script lang="ts">
    import { oscillationParameters } from '$lib/webneut/state.svelte';

    let antiChecked = $state(oscillationParameters.anti.values[0] < 0);
    let nuSelected = $state(oscillationParameters.nu.values[0]);

    const nuSymbol = $derived(antiChecked ? '\u03BD&#773;' : '\u03BD');
    const nuOptions = $derived([
        { label: nuSymbol + '<sub>e</sub>', value: 0 },
        { label: nuSymbol + '<sub>\u03BC</sub>', value: 1 },
        { label: nuSymbol + '<sub>\u03C4</sub>', value: 2 }
    ]);

    function update() {
        oscillationParameters.anti.values[0] = antiChecked ? -1 : 1;
        oscillationParameters.nu.values[0] = nuSelected;
    }
</script>

<div class="my-4">
    <div>
        Antineutrino
        <input type="checkbox" bind:checked={antiChecked} onchange={update} />
    </div>
    <div>
        {#each nuOptions as nuOption, i}
            <input
                type="radio"
                bind:group={nuSelected}
                name="nu_value"
                value={i}
                onchange={update}
            />
            <label class="font-serif" for="nu_options_{i}">{@html nuOption.label}</label>
        {/each}
    </div>
</div>