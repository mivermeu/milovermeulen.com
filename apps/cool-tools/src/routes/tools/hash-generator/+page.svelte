<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';
    import CopyButton from '$lib/components/CopyButton.svelte';
    import FilePick from '$lib/components/FilePick.svelte';

    let input = $state('');
    let output: { algo: string; hash: string }[] = $state([]);

    const algos = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
    let selected = $state(new Set(algos));

    const toHex = (buf: ArrayBuffer) =>
        Array.from(new Uint8Array(buf))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');

    async function hash() {
        if (!input) {
            output = [];
            return;
        }
        output = await Promise.all(
            Array.from(selected).map(async (algo) => {
                const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(input));
                return { algo, hash: toHex(buf) };
            })
        );
    }

    async function onFile(file: File) {
        const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        output = [{ algo: 'SHA-256', hash: toHex(buf) }];
    }
</script>

<ToolShell
    title="Hash Generator"
    desc="Generate cryptographic hashes using crypto.subtle.digest()."
>
    <textarea
        placeholder="Enter text to hash..."
        bind:value={input}
        oninput={hash}
        class="mb-3 h-24 w-full"
    ></textarea>

    <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-brand-text">
        {#each algos as algo (algo)}
            <label class="whitespace-nowrap">
                <input
                    type="checkbox"
                    checked={selected.has(algo)}
                    onchange={() => {
                        if (selected.has(algo)) {
                            selected.delete(algo);
                        } else {
                            selected.add(algo);
                        }
                        hash();
                    }}
                />
                {algo}
            </label>
        {/each}
        <FilePick onfile={onFile} />
    </div>

    {#if output.length > 0}
        <div class="flex flex-col gap-2">
            {#each output as item (item.algo)}
                <div
                    class="flex items-center gap-2 rounded border border-brand-secondary bg-white/5 px-3 py-2"
                >
                    <span class="w-24 shrink-0 text-sm font-semibold text-brand-text"
                        >{item.algo}</span
                    >
                    <code class="flex-1 text-sm break-all text-brand-text-highlight select-all"
                        >{item.hash}</code
                    >
                    <CopyButton value={item.hash} />
                </div>
            {/each}
        </div>
    {/if}
</ToolShell>
