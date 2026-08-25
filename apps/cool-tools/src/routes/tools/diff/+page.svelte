<script lang="ts">
    import { diffChars, diffLines } from 'diff';

    let left = $state('');
    let right = $state('');
    let mode: 'lines' | 'chars' = $state('lines');

    function setLines() { mode = 'lines'; }
    function setChars() { mode = 'chars'; }

    interface Line { text: string; num: number; removed?: boolean; added?: boolean }
    let leftPart = $state<Line[]>([]);
    let rightPart = $state<Line[]>([]);

    function rebuild() {
        const diff = mode === 'lines' ? diffLines(left, right) : diffChars(left, right);
        const lp: Line[] = [];
        const rp: Line[] = [];
        let ln = 0, rn = 0;
        for (const p of diff) {
            const arr = p.value.split('\n').filter((t) => t !== '');
            if (p.removed) {
                for (const t of arr) { ln++; lp.push({ text: t, num: ln, removed: true }); }
            } else if (p.added) {
                for (const t of arr) { rn++; rp.push({ text: t, num: rn, added: true }); }
            } else {
                for (const t of arr) { ln++; rn++; lp.push({ text: t, num: ln }); rp.push({ text: t, num: rn }); }
            }
        }
        leftPart = lp;
        rightPart = rp;
    }

    $effect(() => { left; right; mode; rebuild(); });

    function copy() {
        const joined = leftPart.map((l) => l.text).join('\n');
        navigator.clipboard.writeText(joined);
    }
</script>

<div class="mx-auto max-w-5xl px-4 py-8">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">Text Diff Viewer</h1>
    <p class="mb-6 text-sm text-brand-text">Compare two texts side by side.</p>

    <div class="mb-3 flex items-center gap-3">
        <button onclick={setLines} class={mode === 'lines' ? 'bg-white/10' : ''}>Lines</button>
        <button onclick={setChars} class={mode === 'chars' ? 'bg-white/10' : ''}>Characters</button>
        <button onclick={copy}>Copy Diff</button>
    </div>

    <div class="flex gap-2">
        <textarea
            bind:value={left}
            placeholder="Original text..."
            class="h-64 w-1/2 resize-none font-mono text-xs"
        ></textarea>
        <textarea
            bind:value={right}
            placeholder="Modified text..."
            class="h-64 w-1/2 resize-none font-mono text-xs"
        ></textarea>
    </div>

    {#if left || right}
        <div class="mt-4 flex gap-2">
            <div class="w-1/2 overflow-auto font-mono text-xs leading-relaxed">
                <div class="rounded-t border-x border-t border-brand-secondary bg-white/5 p-1 px-2 text-[10px] text-brand-text">Original</div>
                <div class="border border-brand-secondary bg-white/5 p-2">
                    {#each leftPart as l}
                        <div class="flex">
                            <span class="mr-2 w-6 shrink-0 text-right text-brand-text/40 select-none">{l.num}</span>
                            <span class="whitespace-pre-wrap break-all {l.removed ? 'bg-red-400/20 line-through text-red-300' : ''}">{l.text}</span>
                        </div>
                    {/each}
                </div>
            </div>
            <div class="w-1/2 overflow-auto font-mono text-xs leading-relaxed">
                <div class="rounded-t border-x border-t border-brand-secondary bg-white/5 p-1 px-2 text-[10px] text-brand-text">Modified</div>
                <div class="border border-brand-secondary bg-white/5 p-2">
                    {#each rightPart as l}
                        <div class="flex">
                            <span class="mr-2 w-6 shrink-0 text-right text-brand-text/40 select-none">{l.num}</span>
                            <span class="whitespace-pre-wrap break-all {l.added ? 'bg-green-400/20 text-green-300' : ''}">{l.text}</span>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    {/if}
</div>