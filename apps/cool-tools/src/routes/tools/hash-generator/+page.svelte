<script lang="ts">
    let input = $state('');
    let output: { algo: string; hash: string }[] = $state([]);

    const algos = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
    let selected = $state(new Set(algos));

    async function hash() {
        if (!input) { output = []; return; }
        output = await Promise.all(
            Array.from(selected).map(async (algo) => {
                const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(input));
                const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
                return { algo, hash: hex };
            })
        );
    }

    function handleFile(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const buf = await crypto.subtle.digest('SHA-256', reader.result as ArrayBuffer);
            output = [{ algo: 'SHA-256', hash: Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('') }];
        };
        reader.readAsArrayBuffer(file);
    }

    function copyHash(hash: string) {
        navigator.clipboard.writeText(hash);
    }
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">Hash Generator</h1>
    <p class="mb-6 text-sm text-brand-text">Generate cryptographic hashes using <code class="text-brand-text-highlight">crypto.subtle.digest()</code>.</p>

    <textarea
        placeholder="Enter text to hash..."
        bind:value={input}
        oninput={hash}
        class="mb-3 h-24 w-full"
    ></textarea>

    <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-brand-text">
        {#each algos as algo (algo)}
            <label class="whitespace-nowrap">
                <input type="checkbox" checked={selected.has(algo)} onchange={() => { if (selected.has(algo)) { selected.delete(algo); } else { selected.add(algo); } hash(); }} />
                {algo}
            </label>
        {/each}
        <label>
            <button class="relative cursor-pointer">
                Load File
                <input type="file" onchange={handleFile} class="absolute inset-0 cursor-pointer opacity-0" />
            </button>
        </label>
    </div>

    {#if output.length > 0}
        <div class="flex flex-col gap-2">
            {#each output as item (item.algo)}
                <div class="flex items-center gap-2 rounded border border-brand-secondary bg-white/5 px-3 py-2">
                    <span class="w-24 shrink-0 text-sm font-semibold text-brand-text">{item.algo}</span>
                    <code class="flex-1 break-all text-sm text-brand-text-highlight select-all">{item.hash}</code>
                    <button class="size-6 p-0 text-xs" onclick={() => copyHash(item.hash)} title="Copy">⎘</button>
                </div>
            {/each}
        </div>
    {/if}
</div>