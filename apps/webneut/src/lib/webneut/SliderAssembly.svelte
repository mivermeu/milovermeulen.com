<script lang="ts">
    import RangeSlider from '$lib/webneut/RangeSlider.svelte';
    import { animatingParameter, makeRange as doMakeRange, setValue } from '$lib/webneut/state.svelte';
    import type { Parameter } from '$lib/webneut/types';

    let {
        parameter,
        action_buttons = false
    }: { parameter: Parameter; action_buttons?: boolean } = $props();

    function make_range() {
        doMakeRange(parameter);
    }

    function toggle_animation() {
        animatingParameter.current =
            animatingParameter.current === parameter ? undefined : parameter;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    function on_input(index: number, value: string) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            setValue(parameter, index, Number(value));
        }, 150);
    }
</script>

<div
    class="slider-container @container-normal grid grid-cols-[auto_1fr_auto] items-center gap-4 [grid-template-areas:'action-buttons_slider-name_slider-inputs'_'action-buttons_slider_slider-inputs']"
>
    {#if action_buttons}
        <div class="action-buttons flex flex-col gap-2 [grid-area:action-buttons]">
            <button
                class="slider-button h-8 w-24 [grid-area:1/1/1/1]"
                disabled={parameter.values.length > 1}
                onclick={toggle_animation}
            >
                {animatingParameter.current === parameter ? 'Stop' : 'Animate'}
            </button>
            <button
                class="slider-button h-8 w-24 [grid-area:1/1/1/1]"
                disabled={parameter.values.length > 1}
                onclick={make_range}>Range</button
            >
        </div>
    {/if}
    <div class="slider-name pl-2 [grid-area:slider-name]">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html parameter.label}
    </div>
    <div class="slider [grid-area:slider]">
        <RangeSlider {parameter} />
    </div>
    <div class="slider-inputs flex h-full flex-col justify-end gap-2 [grid-area:slider-inputs]">
        {#each parameter.values as value, i (i)}
            <input
                class="slider-input h-8 w-20 rounded-md p-1"
                {value}
                type="number"
                oninput={(e) => on_input(i, (e.currentTarget as HTMLInputElement).value)}
            />
        {/each}
    </div>
</div>

<style>
    :global(.slider-container + .slider-container) {
        margin-top: 2em;
    }

    @container (max-width: 300px) {
        .slider-container {
            grid-template-areas:
                'action-buttons slider-name'
                'action-buttons slider'
                'slider-inputs slider-inputs';
            grid-template-columns: auto 1fr;
        }
        .slider-inputs {
            flex-direction: row;
        }
    }
</style>
