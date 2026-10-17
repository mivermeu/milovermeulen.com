<script lang="ts">
    let {
        title,
        children,
        actions,
        summary,
        open,
        onToggle,
        bare = false
    }: {
        title: string;
        children?: import('svelte').Snippet;
        actions?: import('svelte').Snippet;
        /** Collapsed-state status line (live summary while closed). */
        summary?: import('svelte').Snippet;
        /** Controlled open state — omit both for a plain static panel. */
        open?: boolean;
        onToggle?: () => void;
        /** Bare variant for the utility bar: no card chrome, dividers come
            from the parent stack. */
        bare?: boolean;
    } = $props();

    const collapsible = $derived(onToggle !== undefined);
    const isOpen = $derived(open ?? true);
</script>

<div
    class={bare
        ? 'pointer-events-auto flex h-full min-h-0 flex-col'
        : 'pointer-events-auto flex min-h-0 flex-col rounded-lg border border-brand-secondary bg-brand-secondary/85 shadow-lg backdrop-blur-sm'}
>
    <div
        class="flex shrink-0 items-center justify-between px-2.5 pt-1.5 md:px-3 md:pt-2 {isOpen &&
        !bare
            ? 'border-b border-brand-secondary'
            : 'pb-1.5 md:pb-2'}"
    >
        {#if collapsible}
            <button
                type="button"
                onclick={onToggle}
                aria-expanded={isOpen}
                aria-label="{isOpen ? 'Collapse' : 'Expand'} {title} panel"
                class="flex min-w-0 flex-1 items-center justify-start gap-1.5 rounded border-0 p-0 text-left outline-hidden hover:bg-white/5 focus-visible:bg-white/10"
            >
                <svg
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                    class="h-3 w-3 shrink-0 text-brand-text/60 transition-transform duration-200 {isOpen
                        ? ''
                        : '-rotate-90'}"
                >
                    <path
                        d="M2 4l4 4 4-4"
                        stroke="currentColor"
                        stroke-width="1.6"
                        fill="none"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
                <span class="shrink-0 text-xs font-semibold text-brand-text-highlight">{title}</span
                >
                {#if !isOpen && summary}
                    <span class="truncate text-[10px] text-brand-text/60">{@render summary()}</span>
                {/if}
            </button>
        {:else}
            <span class="text-xs font-semibold text-brand-text-highlight">{title}</span>
        {/if}
        {#if actions}
            {@render actions()}
        {/if}
    </div>
    <div class="min-h-0 flex-1 flex-col p-2 md:p-3 {isOpen ? 'flex' : 'hidden'}">
        {@render children?.()}
    </div>
</div>
