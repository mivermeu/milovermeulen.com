<script lang='ts'>
    import { createEventDispatcher, type EventDispatcher } from 'svelte';
    import RangeSlider from 'svelte-range-slider-pips';
    import type { Parameter, OscillationParameters } from '$lib/webneut/types';

    export let parameters: OscillationParameters;

    let dispatch: EventDispatcher<{change: OscillationParameters}> = createEventDispatcher<{change: OscillationParameters}>();

    function notify() {
        dispatch('change', parameters);
    }
</script>

<div class='control-panel'>
    {#each Object.entries(parameters) as [parameter_name, parameter]}
        <div class='slider-label'>
            <span class='slider-name'>{@html parameter.label}</span>
            <div class='slider-inputs'>
                <input class='slider-input' bind:value={parameter.values[0]} on:input={notify} />
                {#if parameter.values.length > 1}
                    <input class='slider-input' bind:value={parameter.values[1]} on:input={notify} />
                {/if}
            </div>
        </div>
        <RangeSlider
            bind:values={parameter.values}
            range={parameter.values.length > 1? true: 'min'}
            precision={parameter.precision}
            step={Math.pow(10, -1 * parameter.precision)}
            min={parameter.limits[0]}
            max={parameter.limits[1]}
            on:change={notify} />
    {/each}
</div>

<style lang="scss">
    .control-panel {
        border: solid white;
        border-radius: 5px;
        padding: 10px;
    }

    .slider-label{
        display: flex;
        align-content: center;
        justify-content: space-between;
    }

    .slider-inputs {
        display: flex;
        gap: 0.5em;
    }

    .slider-input {
        height: 2em;
        width: 7em;

        border-radius: 3px;
        border: 0;

        padding: 0.3em;
        font: var(--font-body);
        font-size: calc(0.8 * var(--font-size-body));  // For some reason the font size in inputs turns out bigger?
    }
</style>
