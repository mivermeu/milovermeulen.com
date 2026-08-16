<script lang="ts">
    import type { Snippet } from 'svelte';

    let {
        group = $bindable(),
        value,
        children
    }: { group: number; value: number; children: Snippet } = $props();

    const selected = $derived(group === value);
</script>

<button
    type="button"
    role="radio"
    aria-checked={selected}
    class:panel-switch--selected={selected}
    onclick={() => (group = value)}
>
    {@render children()}
</button>

<style>
    .panel-switch--selected {
        background-color: var(--color-brand-primary);
        color: var(--color-brand-bg);
    }

    .panel-switch--selected:hover {
        background-color: color-mix(in srgb, var(--color-brand-primary) 85%, white 15%);
    }
</style>
