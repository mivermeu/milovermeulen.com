<!-- A grid of hexagons. -->

<script lang='ts'>
    import { onMount, type SvelteComponent } from 'svelte';
    import Hexagon from './Hexagon.svelte';

    export let hex_width: number = 45;
    export let top: number | undefined = undefined;
    export let bottom: number | undefined = undefined;
    export let horizontal_gap: number = 10;
    export let grid_height: number = 600;
    export let transition_speed: number = 800;

    let innerWidth: number = 0;
    $: horizontal_distance = hex_width * 3 satisfies number;
    $: vertical_distance = hex_width * Math.sqrt(3) satisfies number;
    const vertical_gap: number = horizontal_gap / Math.sqrt(3);

    $: num_cols = innerWidth / horizontal_distance satisfies number;
    $: num_rows = grid_height / (vertical_distance + vertical_gap) + 1 satisfies number;
    const x_start: number = -hex_width / 2;
    const y_start: number = bottom === undefined? -3 * hex_width: hex_width;

    let hexagons: SvelteComponent[] = [];
    let pulse_interval: number = 0;

    const hex_sustain: number = 500;
    const pulse_delay: number = 6000;
    const pulse_propagation_delay: number = 200;

    onMount(() => {
        setTimeout(() => vertical_down_grid_pulse(), 200);
        pulse_interval = window.setInterval(() => {
            vertical_down_grid_pulse();
        }, pulse_delay);

        return () => window.clearInterval(pulse_interval);
    });

    function vertical_down_grid_pulse(): void {
        for(let ri = 0; ri < num_rows; ri++) {
            [0, 0.5].forEach((row_offset) => {
                [0, hex_sustain].forEach((time_in_pulse) => {
                    setTimeout(() => {
                        for(let ci = 0; ci < num_cols; ci++) {
                            hexagons[ri * num_cols + ci * 2 + row_offset * 2].raised = time_in_pulse === 0? true: false;
                        }
                    }, (ri + row_offset) * pulse_propagation_delay + time_in_pulse);
                })
            });
        }
    }
</script>

<svelte:window bind:innerWidth />

<div
    class='hex-grid'
    style='--hex-width: {hex_width}px; --grid-height: {grid_height}px; --top: {top}px; --bottom: {bottom}px;'>
    {#each {length: num_rows} as _, ri}
        {#each {length: num_cols} as _, ci}
            {#each [0, 0.5] as offset, oi}
                {@const x = x_start + (ci + offset) * (horizontal_distance + horizontal_gap)}
                {@const y = y_start + (ri + offset) * (vertical_distance + vertical_gap)}
                <Hexagon
                    bind:this={hexagons[ri * num_cols + ci * 2 + oi]}
                    width={hex_width}
                    {x}
                    {y}
                    {transition_speed} />
            {/each}
        {/each}
    {/each}
</div>

<style lang='scss'>
    .hex-grid {
        top: var(--top);
        bottom: var(--bottom);
        position: absolute;
        height: calc(var(--grid-height) + 2 * var(--hex-width));
        width: 100vw;
        overflow: hidden;
    }
</style>