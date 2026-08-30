<script lang="ts">
    let {
        title,
        children
    }: {
        title: string;
        children?: import('svelte').Snippet;
    } = $props();
</script>

<div
    class="pointer-events-auto flex min-h-0 flex-col rounded-lg border border-brand-secondary bg-brand-secondary/85 shadow-lg backdrop-blur-sm"
>
    <div class="shrink-0 border-b border-brand-secondary px-3 pt-2">
        <span class=" text-xs font-semibold text-brand-text-highlight">{title}</span>
    </div>
    <div class="flex min-h-0 flex-1 flex-col p-3">
        {@render children?.()}
    </div>
</div>
