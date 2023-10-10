<!-- A grid of hexagons. -->

<script lang='ts'>
    import { onMount, type SvelteComponent } from 'svelte';
    import Hexagon from './Hexagon.svelte';

    export let hex_width: number = 80;
    export let top: number | undefined = undefined;
    export let bottom: number | undefined = undefined;
    export let horizontal_gap: number = 10;
    export let grid_height: number = 600;
    export let transition_speed: number = 800;

    let timer = 0;
    const start_time: number = Date.now()

    let innerWidth: number = 0;
    $: horizontal_distance = hex_width * 3 + horizontal_gap satisfies number;
    $: vertical_distance = (hex_width * Math.sqrt(3) + vertical_gap) / 2 satisfies number;
    const vertical_gap: number = horizontal_gap / Math.sqrt(3);

    $: num_cols = Math.floor(innerWidth / horizontal_distance) + 2 satisfies number;
    $: num_rows = Math.floor(grid_height / (vertical_distance + vertical_gap)) + 5 satisfies number;
    const x_start: number = -hex_width / 2;
    const y_start: number = bottom === undefined? -3 * hex_width: hex_width;

    let hexagons: Hexagon[] = [];
    $: hexagons = hexagons.filter((hexagon) => hexagon !== null)  // When changing the screen, sometimes null hexagons are left over.
    let interval: number = 0;

    const hex_sustain: number = 700;
    const pulse_delay: number = 6000;
    const pulse_propagation_delay: number = 150;

    onMount(() => {
        // interval = window.setInterval(() => {
        //     timer = Date.now() - start_time;
        // }, 100);

        return () => window.clearInterval(interval);
    });

    let last_pulse_time: number = -pulse_delay;

    $: if(timer - last_pulse_time > pulse_delay) {
        last_pulse_time = timer;

        hexagons.forEach((hexagon, hex_index) => {
            const row_index: number = Math.floor(hex_index / num_cols);
            setTimeout(() => {
                hexagon.raised = 1;
            }, row_index * pulse_propagation_delay);
            setTimeout(() => {
                hexagon.raised = 0;
            }, row_index * pulse_propagation_delay + hex_sustain);
        })
    }

    function raise_surrounding_hexagons(hex_index: number, raise_fraction: number = 0.2): void {
        // Set all surrounding hexagons to be half raised.
        let hex_indices_to_be_raised: number[] = [
            hex_index - num_cols,
            hex_index - 2 * num_cols,
            hex_index + num_cols,
            hex_index + 2 * num_cols,
        ];
        if(Math.floor(hex_index / num_cols) % 2 === 0) {
            hex_indices_to_be_raised.push(
                hex_index - num_cols - 1,
                hex_index + num_cols - 1
            );
        } else {
            hex_indices_to_be_raised.push(
                hex_index - num_cols + 1,
                hex_index + num_cols + 1
            );
        }
        hex_indices_to_be_raised = hex_indices_to_be_raised.filter(x => x >= 0 && x < hexagons.length);

        hex_indices_to_be_raised.forEach(index => hexagons[index].raised = 0.3);
    }

    function reset_hexagons(): void {
        // Set all hexagons to not be raised.
        hexagons.forEach((hexagon) => hexagon.raised = 0);
    }
    }
</script>

<svelte:window bind:innerWidth />

<div
    class='hex-grid'
    style='--hex-width: {hex_width}px; --grid-height: {grid_height}px; --top: {top}px; --bottom: {bottom}px;'>
    {#each {length: num_rows * num_cols} as _, hex_index}
        {@const row_index = Math.floor(hex_index / num_cols)}
        {@const column_index = hex_index % num_cols}
        {@const h_offset = (row_index % 2) / 2}
        {@const x = x_start + (column_index + h_offset) * horizontal_distance}
        {@const y = y_start + row_index * vertical_distance}
        <Hexagon
            bind:this={hexagons[hex_index]}
            width={hex_width}
            {x}
            {y}
            {transition_speed}
            on:mouseenter={() => raise_surrounding_hexagons(hex_index)}
            on:mouseleave={reset_hexagons} />
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