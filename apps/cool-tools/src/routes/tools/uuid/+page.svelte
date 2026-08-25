<script lang="ts">
    let count = $state(1);
    let uuids = $state<string[]>([]);

    function generate() {
        uuids = Array.from({ length: count }, () => crypto.randomUUID());
    }

    function copyAll() {
        navigator.clipboard.writeText(uuids.join('\n'));
    }

    function copyOne(uuid: string) {
        navigator.clipboard.writeText(uuid);
    }
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">UUID Generator</h1>
    <p class="mb-6 text-sm text-brand-text">Generate v4 UUIDs using <code class="text-brand-text-highlight">crypto.randomUUID()</code>.</p>

    <div class="mb-4 flex items-center gap-3">
        <label class="text-sm text-brand-text" for="count">Count:</label>
        <input id="count" type="number" min="1" max="100" bind:value={count} class="w-20" />
        <button onclick={generate}>Generate</button>
        {#if uuids.length > 0}
            <button onclick={copyAll}>Copy All</button>
        {/if}
    </div>

    {#if uuids.length > 0}
        <div class="flex flex-col gap-1.5">
            {#each uuids as uuid}
                <div class="flex items-center gap-2 rounded border border-brand-secondary bg-white/5 px-3 py-2 font-mono text-sm text-brand-text-highlight">
                    <span class="flex-1 select-all">{uuid}</span>
                    <button class="size-6 p-0 text-xs" onclick={() => copyOne(uuid)} title="Copy">⎘</button>
                </div>
            {/each}
        </div>
    {/if}
</div>