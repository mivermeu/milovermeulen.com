<script lang="ts">
    import { icons } from '$lib/data/icons';

    interface Props {
        icon_name: keyof typeof icons;
        width?: string;
        height?: string;
        focusable?: string | number | null | undefined;
        class?: string;
    }

    let {
        icon_name,
        width = '100%',
        height = '100%',
        focusable,
        class: className
    }: Props = $props();

    const display_icon = $derived(icons[icon_name]);
</script>

{#if display_icon}
    <svg
        class={className}
        {focusable}
        {width}
        {height}
        viewBox="0 0 {display_icon.box} {display_icon.box}"
    >
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html display_icon.svg_path}
    </svg>
{/if}
