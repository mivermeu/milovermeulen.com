<script lang='ts'>
    import RangeSlider from 'svelte-range-slider-pips';
    import type { Parameter } from './types';
    import { createEventDispatcher, type EventDispatcher } from 'svelte';

    let dispatch: EventDispatcher<{change: Parameter}> = createEventDispatcher<{change: Parameter}>();

    export let parameter: Parameter;

    function notify() {
        dispatch('change', parameter);
    }
</script>

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

<style lang='scss'>
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