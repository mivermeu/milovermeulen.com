<script lang='ts'>
    import { animating_parameter, oscillation_parameters } from './stores';
    // import RangeSlider from 'svelte-range-slider-pips';
    import type { Parameter } from './types';

    export let parameter: Parameter;
    export let action_buttons: boolean = false;

    function make_range(): void {
        // Set all parameters to single values, then set the current parameter to range.
        for(let osc_parameter of Object.values($oscillation_parameters)) {
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

    function toggle_animation(): void {
        if($animating_parameter === parameter) {
            $animating_parameter = undefined;
        } else {
            $animating_parameter = parameter;
        }
    }
</script>

{#if action_buttons}
    <button class='slider-button' disabled={parameter.values.length > 1} on:click={toggle_animation}>
        {$animating_parameter === parameter? 'Stop': 'Animate'}
    </button>
    <button class='slider-button' disabled={parameter.values.length > 1} on:click={make_range}>Range</button>
{/if}
<div class='slider-label'>
    <span class='slider-name'>{@html parameter.label}</span>
    <div class='slider-inputs'>
        {#each parameter.values as value}
            <input class='slider-input' bind:value={value} type='number' />
        {/each}
    </div>
</div>
{#each parameter.values as value}
    <input
        type=range bind:value={value}
        min={parameter.limits[0]}
        max={parameter.limits[1]}
        step={Math.pow(10, -1 * parameter.precision)} />
{/each}
<br>
<!-- TODO: Reimplement this once the store update bug is fixed: https://github.com/simeydotme/svelte-range-slider-pips/issues/116
<RangeSlider
    bind:values={parameter.values}
    range={parameter.values.length > 1? true: 'min'}
    precision={parameter.precision}
    step={Math.pow(10, -1 * parameter.precision)}
    min={parameter.limits[0]}
    max={parameter.limits[1]}
    springValues={{stiffness: 1, damping: 1 }} /> -->

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