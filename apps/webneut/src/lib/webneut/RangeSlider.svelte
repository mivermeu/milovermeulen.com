<script lang="ts">
    // Define standard interface mimicking your old props structure
    interface Parameter {
        values: number[];
        limits: [number, number];
        precision: number;
    }

    // Svelte 5 Runes Props syntax
    let { parameter = $bindable() }: { parameter: Parameter } = $props();

    // Deconstruct parameter bounds for template readability
    const min = parameter.limits[0];
    const max = parameter.limits[1];

    // Calculate dynamic step sizes exactly like your old configuration
    const step = Math.pow(10, -1 * parameter.precision);

    // Derived percentages to handle background track painting
    let pctLeft = $derived(((parameter.values[0] - min) / (max - min)) * 100);
    let pctRight = $derived(
        parameter.values.length > 1 ? ((parameter.values[1] - min) / (max - min)) * 100 : 100
    );

    // Enforce boundary cross protection when running dual-thumbs
    $effect(() => {
        if (parameter.values.length > 1 && parameter.values[0] > parameter.values[1]) {
            parameter.values[0] = parameter.values[1];
        }
    });
</script>

<div class="slider-wrapper">
    <div class="slider-container">
        <!-- Active track zone highlight -->
        <div
            class="slider-track-highlight"
            style:left="{parameter.values.length > 1 ? pctLeft : 0}%"
            style:right="{100 - pctRight}%"
        ></div>

        <!-- Handle 1 (Always rendered) -->
        <input
            type="range"
            {min}
            {max}
            {step}
            bind:value={parameter.values[0]}
            class="thumb-input"
        />

        <!-- Handle 2 (Conditionally rendered for multi-thumb ranges) -->
        {#if parameter.values.length > 1}
            <input
                type="range"
                {min}
                {max}
                {step}
                bind:value={parameter.values[1]}
                class="thumb-input"
            />
        {/if}
    </div>
</div>

<style>
    .slider-wrapper {
        width: 100%;
        padding: 10px 0;
    }

    .slider-container {
        position: relative;
        width: 100%;
        height: 6px;
        background: #e2e8f0;
        border-radius: 4px;
    }

    .slider-track-highlight {
        position: absolute;
        height: 100%;
        background: #3b82f6;
        border-radius: 4px;
    }

    .thumb-input {
        position: absolute;
        width: 100%;
        background: none;
        pointer-events: none;
        -webkit-appearance: none;
        appearance: none;
        left: 0;
        top: -5px;
        margin: 0;
    }

    /* Target browser pseudoclasses safely */
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
