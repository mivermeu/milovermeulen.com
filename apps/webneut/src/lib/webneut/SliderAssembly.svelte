<script lang="ts">
    import RangeSlider from '$lib/webneut/RangeSlider.svelte';
    import { animatingParameter, makeRange as doMakeRange } from '$lib/webneut/state.svelte';
    import type { Parameter } from '$lib/webneut/types';

    let {
        parameter = $bindable(),
        action_buttons = false
    }: { parameter: Parameter; action_buttons?: boolean } = $props();

    function make_range() {
        doMakeRange(parameter);
    }

    function toggle_animation() {
        animatingParameter.current =
            animatingParameter.current === parameter ? undefined : parameter;
    }
</script>

<div class="slider-container">
    {#if action_buttons}
        <div class="action-buttons">
            <button
                class="slider-button"
                disabled={parameter.values.length > 1}
                onclick={toggle_animation}
            >
                {animatingParameter.current === parameter ? 'Stop' : 'Animate'}
            </button>
            <button
                class="slider-button"
                disabled={parameter.values.length > 1}
                onclick={make_range}>Range</button
            >
        </div>
    {/if}
    <div class="slider-name">{@html parameter.label}</div>
    <div class="slider">
        <RangeSlider bind:parameter />
    </div>
    <div class="slider-inputs">
        {#each parameter.values as _, i}
            <input class="slider-input" bind:value={parameter.values[i]} type="number" />
        {/each}
    </div>
</div>

<style>
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
    }

    @container (max-width: 300px) {
        .slider-container {
            grid-template-areas:
                'action-buttons slider-name'
                'action-buttons slider'
                'slider-inputs slider-inputs';
            grid-template-columns: auto 1fr;
        }
        .slider-container .slider-inputs {
            flex-direction: row;
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
        font-size: 0.8em;
    }
</style>
