<script lang="ts">
    import type { Snippet } from 'svelte';

    // The single shared (i) popover used across the tracker (graph axis
    // pickers, passes list, ...). One implementation on purpose — do not
    // re-implement the chrome locally.
    let { label, children }: { label: string; children: Snippet } = $props();
</script>

<span class="group relative inline-flex">
    <button
        type="button"
        aria-label={label}
        class="flex h-5 w-5 items-center justify-center rounded-full border border-brand-text/30 p-0 text-[9px] font-semibold text-brand-text/60 outline-hidden hover:border-brand-text/60 hover:bg-transparent hover:text-brand-text focus-visible:bg-white/10"
        >i</button
    >
    <span
        role="tooltip"
        class="pointer-events-none absolute top-5 right-0 z-40 hidden w-52 rounded border border-brand-secondary bg-brand-bg/95 p-2 text-left text-[10px] leading-snug text-brand-text shadow-lg group-focus-within:block group-hover:block"
        >{@render children()}</span
    >
</span>
