<script lang="ts">
    let {
        value,
        options,
        onpick
    }: {
        value: string;
        options: { value: string; label: string }[];
        onpick?: (v: string) => void;
    } = $props();
</script>

<div class="flex gap-2">
    {#each options as o (o.value)}
        <button
            type="button"
            class={value === o.value ? 'bg-white/10' : ''}
            onclick={() => onpick?.(o.value)}>{o.label}</button
        >
    {/each}
</div>
