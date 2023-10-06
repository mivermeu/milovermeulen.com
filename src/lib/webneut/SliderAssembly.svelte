<script lang='ts'>
    import RangeSlider from 'svelte-range-slider-pips';
    import { animating_parameter, oscillation_parameters } from './stores';
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

<div class='slider-container'>
    {#if action_buttons}
        <div class='action-buttons'>
            <button class='slider-button' disabled={parameter.values.length > 1} on:click={toggle_animation}>
                {$animating_parameter === parameter? 'Stop': 'Animate'}
            </button>
            <button class='slider-button' disabled={parameter.values.length > 1} on:click={make_range}>Range</button>
        </div>
    {/if}
    <div class='slider-name'>{@html parameter.label}</div>
    <div class='slider'>
        <RangeSlider
            bind:values={parameter.values}
            range={parameter.values.length > 1? true: 'min'}
            precision={parameter.precision}
            step={Math.pow(10, -1 * parameter.precision)}
            min={parameter.limits[0]}
            max={parameter.limits[1]}
            springValues={{stiffness: 1, damping: 1 }} />
    </div>
    <div class='slider-inputs'>
        {#each parameter.values as value}
            <input class='slider-input' bind:value={value} type='number' />
        {/each}
    </div>
</div>

<style lang='scss'>
    :global(.slider-container + .slider-container) {
        margin-top: 2em;
    }

    .slider-container {
        display: grid;
        align-items: center;
        gap: 0.2em;
        grid-template-areas:
            'action-buttons slider-name slider-inputs'
            'action-buttons slider slider-inputs';
        grid-template-columns: auto 1fr auto;

        container-type: normal;

        @container (max-width: 300px) {
            grid-template-areas:
                'action-buttons slider-name'
                'action-buttons slider'
                'slider-inputs slider-inputs';
            grid-template-columns: auto 1fr;

            .slider-inputs {
                flex-direction: row;
            }
        }
    }

    .action-buttons {
        grid-area: action-buttons;
        display: flex;
        flex-direction: column;
        gap: 0.5em;
    }

    .slider-button {
        align-self: center;
        grid-area: 1/1/1/1;
        width: 5em;
        height: 2em;
    }

    .slider {
        grid-area: slider;
    }

    .slider-name {
        grid-area: slider-name;
        padding-left: 1em;
    }

    .slider-inputs {
        grid-area: slider-inputs;
        display: flex;
        flex-direction: column;
        gap: 0.5em;
        justify-content: end;
    }

    .slider-input {
        height: 2em;
        width: 5em;

        border-radius: 3px;
        border: 0;

        padding: 0.3em;
        font: var(--font-body);
        font-size: calc(0.8 * var(--font-size-body));  // For some reason the font size in inputs turns out bigger?
    }
</style>