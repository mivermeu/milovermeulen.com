<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';
    import CopyButton from '$lib/components/CopyButton.svelte';

    let count = $state(1);
    let uuids = $state<string[]>([]);

    function generate() {
        uuids = Array.from({ length: count }, () => crypto.randomUUID());
    }
</script>

<ToolShell title="UUID Generator" desc="Generate v4 UUIDs using crypto.randomUUID().">
    <div class="mb-4 flex items-center gap-3">
        <label class="text-sm text-brand-text" for="count">Count:</label>
        <input id="count" type="number" min="1" max="100" bind:value={count} class="w-20" />
        <button type="button" onclick={generate}>Generate</button>
        <CopyButton value={uuids.join('\n')} label="Copy All" />
    </div>

    {#if uuids.length > 0}
        <div class="flex flex-col gap-1.5">
            {#each uuids as uuid (uuid)}
                <div
                    class="flex items-center gap-2 rounded border border-brand-secondary bg-white/5 px-3 py-2 font-mono text-sm text-brand-text-highlight"
                >
                    <span class="flex-1 select-all">{uuid}</span>
                    <CopyButton value={uuid} />
                </div>
            {/each}
        </div>
    {/if}
</ToolShell>
