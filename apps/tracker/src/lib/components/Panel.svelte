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
    class="pointer-events-auto rounded-lg border border-brand-secondary bg-brand-secondary/85 shadow-lg backdrop-blur-sm"
>
    <div class="border-b border-brand-secondary px-3 py-2">
        <h3 class="text-xs font-semibold text-brand-text-highlight">{title}</h3>
    </div>
    <div class="p-3">
        {@render children?.()}
    </div>
</div>
