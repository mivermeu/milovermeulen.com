<script lang="ts">
    import { diffChars, diffLines } from 'diff';
    import ToolShell from '$lib/components/ToolShell.svelte';
    import CopyButton from '$lib/components/CopyButton.svelte';
    import Toggle from '$lib/components/Toggle.svelte';

    let left = $state('');
    let right = $state('');
    let mode: 'lines' | 'chars' = $state('lines');

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

    $effect(() => { rebuild(); });
</script>

<ToolShell title="Text Diff Viewer" desc="Compare two texts side by side." max="max-w-5xl">
    <div class="mb-3 flex items-center gap-3">
        <Toggle
            value={mode}
            options={[{ value: 'lines', label: 'Lines' }, { value: 'chars', label: 'Characters' }]}
            onpick={(v) => mode = v as 'lines' | 'chars'}
        />
        <CopyButton value={leftPart.map((l) => l.text).join('\n')} label="Copy Diff" />
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
                    {#each leftPart as l (l.num)}
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
                    {#each rightPart as l (l.num)}
                        <div class="flex">
                            <span class="mr-2 w-6 shrink-0 text-right text-brand-text/40 select-none">{l.num}</span>
                            <span class="whitespace-pre-wrap break-all {l.added ? 'bg-green-400/20 text-green-300' : ''}">{l.text}</span>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    {/if}
</ToolShell>