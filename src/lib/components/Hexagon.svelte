<!-- Create a single hexagon. -->

<svelte:options accessors />

<script lang='ts'>
    // It's a bit ugly to set CSS strings via props, but I don't know a better way to propagate them.
    export let x: number = 0;
    export let y: number = 0;
    export let width: number = 50;
    export let border_radius: number = 20;
    export let rotation: number = 0;
    export let color: string = 'var(--color-card)';
    export let transition_speed: number = 600;
    export let raising: boolean = false;

    export function pulse(sustain: number = 350): void {
        raising = true;
        setTimeout(() => raising = false, sustain);
    }

    const raise_translation: number = width / 4;

    $: z_index = raising? 1: 0 satisfies number;
    $: display_color = raising? 'var(--color-button)': color satisfies string;
    $: display_y = raising? y - raise_translation: y satisfies number;

    function toggle_raise(): void {
        raising = !raising;
    }
</script>

<div
    class='hex {raising? 'shadow': ''}'
    style='
        --x: {x + 'px'};
        --y: {display_y + 'px'};
        --width: {width + 'px'};
        --border-radius: {border_radius + 'px'};
        --color: {display_color};
        --rotation: {rotation + 'deg'};
        --z-index: {z_index};
        --transition-speed: {transition_speed}ms'
    on:mouseover={toggle_raise}
    on:focus
    role='presentation'
/>

<style lang='scss'>
    .hex {
        position: absolute;
        top: var(--y);
        left: var(--x);
        width: var(--width);
        height: calc(var(--width) * sqrt(3));
        border-radius: var(--border-radius) / calc(var(--border-radius) / 2);
        background: var(--color);
        transition: 600ms;
        transform: rotate(var(--rotation));
        z-index: var(--z-index);

        pointer-events: auto;

        &:before,
        &:after {
            position: absolute;
            width: inherit;
            height: inherit;
            border-radius: inherit;
            background: inherit;
            content: '';
        }

        &:before {
            -webkit-transform: rotate(60deg);
            transform: rotate(60deg);
        }

        &:after {
            -webkit-transform: rotate(-60deg);
            transform: rotate(-60deg);
        }
    }

    .shadow {
        box-shadow: 0 5px 5px var(--color-shadow);
    }
</style>
