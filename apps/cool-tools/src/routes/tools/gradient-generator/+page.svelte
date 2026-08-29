<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';
    import CopyButton from '$lib/components/CopyButton.svelte';
    import CodeBlock from '$lib/components/CodeBlock.svelte';
    import Toggle from '$lib/components/Toggle.svelte';

    let stops = $state<{ color: string; pos: number }[]>([
        { color: '#ff6b6b', pos: 0 },
        { color: '#6bcbff', pos: 100 }
    ]);
    let angle = $state(90);
    let type: 'linear' | 'radial' = $state('linear');

    function onType(v: string) {
        type = v as 'linear' | 'radial';
    }

    let css = $derived.by(() => {
        const sorted = [...stops].sort((a, b) => a.pos - b.pos);
        const parts = sorted.map((s) => `${s.color} ${s.pos}%`);
        return type === 'linear'
            ? `linear-gradient(${angle}deg, ${parts.join(', ')})`
            : `radial-gradient(circle, ${parts.join(', ')})`;
    });

    function addStop() {
        if (stops.length >= 8) return;
        const mid = stops.reduce(
            (a, b) => (Math.abs(a - 50) < Math.abs(b.pos - 50) ? a : b.pos),
            50
        );
        stops = [...stops, { color: '#888888', pos: mid }];
    }

    function removeStop(i: number) {
        if (stops.length <= 2) return;
        stops = stops.filter((_, idx) => idx !== i);
    }
</script>

<ToolShell title="CSS Gradient Generator" desc="Create and export CSS gradients visually.">
    <div class="mb-4 h-32 rounded-lg border border-brand-secondary" style="background: {css}"></div>

    <div class="mb-4 flex flex-wrap items-center gap-3">
        <Toggle
            value={type}
            options={[
                { value: 'linear', label: 'Linear' },
                { value: 'radial', label: 'Radial' }
            ]}
            onpick={onType}
        />
        {#if type === 'linear'}
            <label class="text-sm text-brand-text" for="angle">Angle:</label>
            <span class="w-8 text-xs text-brand-text-highlight">{angle}°</span>
            <input id="angle" type="range" min="0" max="360" bind:value={angle} class="w-24" />
        {/if}
        <button type="button" onclick={addStop}>Add Stop</button>
        <CopyButton value={`background: ${css};`} label="Copy CSS" />
    </div>

    <div class="flex flex-col gap-2">
        {#each stops as stop, i (i)}
            <div
                class="flex items-center gap-2 rounded border border-brand-secondary bg-white/5 px-3 py-2"
            >
                <input
                    type="color"
                    bind:value={stop.color}
                    class="size-8 cursor-pointer rounded border-0 p-0.5"
                />
                <span class="w-16 font-mono text-xs text-brand-text-highlight">{stop.color}</span>
                <input type="range" min="0" max="100" bind:value={stop.pos} class="flex-1" />
                <span class="w-8 text-xs text-brand-text">{stop.pos}%</span>
                <button
                    type="button"
                    class="size-6 p-0 text-xs"
                    onclick={() => removeStop(i)}
                    disabled={stops.length <= 2}>✕</button
                >
            </div>
        {/each}
    </div>

    <div class="mt-4">
        <CodeBlock value={`background: ${css};`} />
    </div>
</ToolShell>
