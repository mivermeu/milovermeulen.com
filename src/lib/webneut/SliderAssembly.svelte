<script lang='ts'>
    import { oscillation_parameters } from './stores';
    import RangeSlider from 'svelte-range-slider-pips';
    import type { Parameter } from './types';
    import { createEventDispatcher, type EventDispatcher } from 'svelte';

    export let parameter: Parameter;
    export let action_buttons: boolean = false;

    function make_range(): void {
        // Set all parameters to single values, then set the current parameter to range.
        for(let [_, osc_parameter] of Object.entries($oscillation_parameters)) {
            if(osc_parameter.values.length > 1) {
                osc_parameter.values = [osc_parameter.values[1]];
            }
        }
        if(parameter.values[0] > 0) {
            parameter.values = [0, parameter.values[0]];
        } else {
            parameter.values = [parameter.values[0], 0];
        }
    }
</script>

{#if action_buttons}
    <button class='slider-button' on:click={() => console.log('Not implemented yet!')}>Animate</button>
    {#if parameter.values.length < 2}
        <button class='slider-button' on:click={make_range}>Range</button>
    {/if}
{/if}
<div class='slider-label'>
    <span class='slider-name'>{@html parameter.label}</span>
    <div class='slider-inputs'>
        {#each parameter.values as value}
            <input class='slider-input' bind:value={value} />
        {/each}
    </div>
</div>
<RangeSlider
    bind:values={parameter.values}
    range={parameter.values.length > 1? true: 'min'}
    precision={parameter.precision}
    step={Math.pow(10, -1 * parameter.precision)}
    min={parameter.limits[0]}
    max={parameter.limits[1]} />

<style lang='scss'>
    .slider-button {
        align-self: center;
        grid-area: 1/1/1/1;
        width: 6em;
        height: 2em;
        border: 0.2em solid white;
    }

    .slider-label {
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