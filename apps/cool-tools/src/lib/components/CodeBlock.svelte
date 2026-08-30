<script lang="ts">
    let { value, select = true }: { value: string; select?: boolean } = $props();
</script>

<pre
    class="overflow-x-auto rounded border border-brand-secondary bg-white/5 p-3 font-mono text-xs text-brand-text-highlight {select
        ? 'select-all'
        : ''}">{value}</pre>
