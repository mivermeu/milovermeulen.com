<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';

    let pattern = $state('');
    let flags = $state('g');
    let testText = $state('');
    let matches: { full: string; groups: string[]; index: number }[] = $state([]);
    let error = $state('');

    function test() {
        error = ''; matches = [];
        if (!pattern || !testText) return;
        try {
            const re = new RegExp(pattern, flags);
            let m: RegExpExecArray | null;
            while ((m = re.exec(testText)) !== null) {
                matches.push({ full: m[0], groups: m.slice(1), index: m.index });
                if (!re.global && !re.sticky) break;
            }
        } catch (e) {
            error = (e as Error).message;
        }
    }
</script>

<ToolShell title="Regex Tester" desc="Test regular expressions with live matching." max="max-w-3xl">
    <div class="mb-3 flex flex-wrap items-center gap-3">
        <label class="text-sm text-brand-text" for="pattern">/<input id="pattern" type="text" placeholder="pattern" bind:value={pattern} oninput={test} class="w-48" />/</label>
        <input type="text" placeholder="flags" bind:value={flags} oninput={test} class="w-20" />
    </div>

    {#if error}
        <p class="mb-3 text-sm text-red-400">{error}</p>
    {/if}

    <textarea
        placeholder="Test string..."
        bind:value={testText}
        oninput={test}
        class="mb-4 h-28 w-full"
    ></textarea>

    {#if matches.length > 0}
        <h3>Matches ({matches.length})</h3>
        <div class="flex flex-col gap-1.5">
            {#each matches as m, i (m.index)}
                <div class="rounded border border-brand-secondary bg-white/5 px-3 py-2 font-mono text-xs text-brand-text-highlight">
                    <span class="font-semibold text-brand-text">#{i + 1} </span>
                    <span class="select-all">{m.full}</span>
                    <span class="text-brand-text"> @ {m.index}</span>
                    {#if m.groups.length > 0}
                        <div class="mt-1 pl-4 text-brand-text">
                            {#each m.groups as g, gi (gi)}
                                <div>Group {gi + 1}: <span class="text-brand-text-highlight">{g ?? '(undefined)'}</span></div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {:else if testText && pattern && !error}
        <p class="text-sm text-brand-text">No matches found.</p>
    {/if}
</ToolShell>