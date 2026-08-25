<script lang="ts">
    import type { Snippet } from 'svelte';

    let { children, title, desc, max = 'max-w-2xl', cls = '' }: {
        children: Snippet;
        title: string;
        desc: string;
        max?: string;
        cls?: string;
    } = $props();
</script>

<div class="mx-auto {max} px-4 py-8 {cls}">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">{title}</h1>
    <p class="mb-6 text-sm text-brand-text">{desc}</p>
    {@render children()}
</div>