<script lang="ts">
    import type { Parameter } from './types';

    let { parameter = $bindable() }: { parameter: Parameter } = $props();

    const min = parameter.limits[0];
    const max = parameter.limits[1];
    const step = Math.pow(10, -1 * parameter.precision);
    const snapThreshold = (max - min) * 0.015;

    let pctLeft = $derived(((parameter.values[0] - min) / (max - min)) * 100);
    let pctRight = $derived(
        parameter.values.length > 1 ? ((parameter.values[1] - min) / (max - min)) * 100 : 100
    );

    function snap(value: number): number {
        for (const s of parameter.snaps) {
            if (Math.abs(value - s) <= snapThreshold) return s;
        }
        return value;
    }

    function onInput(index: number, e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const snapped = snap(Number(input.value));
        input.value = String(snapped);
        parameter.values[index] = snapped;
    }

    $effect(() => {
        if (parameter.values.length > 1 && parameter.values[0] > parameter.values[1]) {
            parameter.values[0] = parameter.values[1];
        }
    });
</script>

<div class="w-full py-2.5">
    <div class="relative h-1.5 w-full rounded bg-slate-200">
        {#if parameter.values.length > 1}
            <div
                class="absolute h-full rounded bg-blue-500"
                style:left="{pctLeft}%"
                style:right="{100 - pctRight}%"
            ></div>
        {:else}
            <div
                class="absolute h-full rounded bg-blue-500"
                style:left="0%"
                style:right="{100 - pctLeft}%"
            ></div>
        {/if}

        <input
            type="range"
            {min}
            {max}
            {step}
            value={parameter.values[0]}
            oninput={(e) => onInput(0, e)}
            class="thumb-input pointer-events-none absolute top-0 left-0 m-0 h-1.5 w-full appearance-none bg-transparent"
        />

        {#if parameter.values.length > 1}
            <input
                type="range"
                {min}
                {max}
                {step}
                value={parameter.values[1]}
                oninput={(e) => onInput(1, e)}
                class="thumb-input pointer-events-none absolute top-0 left-0 m-0 h-1.5 w-full appearance-none bg-transparent"
            />
        {/if}
    </div>
</div>

<style>
    .thumb-input::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #3b82f6;
        cursor: pointer;
        pointer-events: auto;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    }

    .thumb-input::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #3b82f6;
        cursor: pointer;
        pointer-events: auto;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    }
</style>
