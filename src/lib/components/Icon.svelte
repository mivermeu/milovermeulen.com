<!-- An SVG icon. All icons of the app are stored here. -->

<script lang='ts'>
    import { icons } from '$lib/data/icons';

    export let icon_name: keyof typeof icons;
    export let width: string = '100%';
    export let height: string = '100%';
    export let focusable: string | number | null | undefined = undefined;

    const display_icon = icons[icon_name];
</script>

<svg
    class={$$props.class}
    {focusable}
    {width}
    {height}
    viewBox='0 0 {display_icon.box} {display_icon.box}'>
    {@html display_icon.svg_path}
</svg>

<style lang='scss'>
    svg {
        fill: var(--color-icon);
        stroke: var(--color-icon);
    }
</style>