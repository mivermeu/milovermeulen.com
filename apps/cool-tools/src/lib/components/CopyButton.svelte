<script lang="ts">
    let { value, label }: { value: string; label?: string } = $props();
    let copied = $state(false);

    async function copy() {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        copied = true;
        setTimeout(() => (copied = false), 1000);
    }
</script>

<button
    type="button"
    class={label ? 'text-xs' : 'size-6 p-0 text-xs'}
    title="Copy"
    aria-label={label ? undefined : 'Copy'}
    onclick={copy}
>
    {copied ? 'Copied!' : (label ?? '⎘')}
</button>