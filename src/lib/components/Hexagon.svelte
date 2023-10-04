<!-- Create a single hexagon. -->

<svelte:options accessors />

<script lang='ts'>
    import { dev_hexagon_pressed } from "../../routes/stores";

    // It's a bit ugly to set CSS strings via props, but I don't know a better way to propagate them.
    export let x: number = 0;
    export let y: number = 0;
    export let width: number = 50;
    export let border_radius: number = width / 10;
    export let rotation: number = 0;
    export let color: string = 'var(--color-card)';
    export let transition_speed: number = 600;
    export let raised: boolean = false;

    const raise_translation: number = width / 4;

    $: z_index = raised? 1: 0 satisfies number;
    $: display_color = raised? 'var(--color-button)': color satisfies string;
    $: display_y = raised? y - raise_translation: y satisfies number;

    function enter_raise(): void {
        raised = true;
    }

    function handle_click(): void {
        // Activate a dev environment.
        if(x < 0 && y < 0) {
            console.log('*hacker voice* I\'m in.');
            dev_hexagon_pressed.set(true);
        }
    }
</script>

<div
    class='hex {raised? 'shadow': ''}'
    style='
        --x: {x + 'px'};
        --y: {display_y + 'px'};
        --width: {width + 'px'};
        --border-radius: {border_radius + 'px'};
        --color: {display_color};
        --rotation: {rotation + 'deg'};
        --z-index: {z_index};
        --transition-speed: {transition_speed}ms;
        --raise-translation: {raise_translation}px;'
    on:mouseover={enter_raise}
    on:focus
    on:click={handle_click}
    role='presentation'
/>

<style lang='scss'>
    .hex {
        position: absolute;
        top: var(--y);
        left: var(--x);
        width: var(--width);
        height: calc(var(--width) * 1.732);  // Chrome can't handle sqrt(3) in CSS?
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
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
        filter: drop-shadow(0 var(--raise-translation) 5px var(--color-shadow));
    }
</style>
