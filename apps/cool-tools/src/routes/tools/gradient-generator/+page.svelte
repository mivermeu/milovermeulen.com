<script lang="ts">
    let stops = $state<{ color: string; pos: number }[]>([
        { color: '#ff6b6b', pos: 0 },
        { color: '#6bcbff', pos: 100 }
    ]);
    let angle = $state(90);
    let type: 'linear' | 'radial' = $state('linear');

    function setLinear() { type = 'linear'; }
    function setRadial() { type = 'radial'; }

    function cssValue() {
        const sorted = [...stops].sort((a, b) => a.pos - b.pos);
        const parts = sorted.map((s) => `${s.color} ${s.pos}%`);
        if (type === 'linear') return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
        return `radial-gradient(circle, ${parts.join(', ')})`;
    }

    function addStop() {
        if (stops.length >= 8) return;
        const mid = stops.reduce((a, b) => Math.abs(a - 50) < Math.abs(b.pos - 50) ? a : b.pos, 50);
        stops = [...stops, { color: '#888888', pos: mid }];
    }

    function removeStop(i: number) {
        if (stops.length <= 2) return;
        stops = stops.filter((_, idx) => idx !== i);
    }

    function copy() {
        navigator.clipboard.writeText(`background: ${cssValue()};`);
    }
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">CSS Gradient Generator</h1>
    <p class="mb-6 text-sm text-brand-text">Create and export CSS gradients visually.</p>

    <div class="mb-4 h-32 rounded-lg border border-brand-secondary" style="background: {cssValue()}"></div>

    <div class="mb-4 flex flex-wrap items-center gap-3">
        <button onclick={setLinear} class={type === 'linear' ? 'bg-white/10' : ''}>Linear</button>
        <button onclick={setRadial} class={type === 'radial' ? 'bg-white/10' : ''}>Radial</button>
        {#if type === 'linear'}
            <label class="text-sm text-brand-text" for="angle">Angle:</label>
            <span class="w-8 text-xs text-brand-text-highlight">{angle}°</span>
            <input id="angle" type="range" min="0" max="360" bind:value={angle} class="w-24" />
        {/if}
        <button onclick={addStop}>Add Stop</button>
        <button onclick={copy}>Copy CSS</button>
    </div>

    <div class="flex flex-col gap-2">
        {#each stops as stop, i (i)}
            <div class="flex items-center gap-2 rounded border border-brand-secondary bg-white/5 px-3 py-2">
                <input type="color" bind:value={stop.color} class="size-8 cursor-pointer rounded border-0 p-0.5" />
                <span class="w-16 font-mono text-xs text-brand-text-highlight">{stop.color}</span>
                <input type="range" min="0" max="100" bind:value={stop.pos} class="flex-1" />
                <span class="w-8 text-xs text-brand-text">{stop.pos}%</span>
                <button class="size-6 p-0 text-xs" onclick={() => removeStop(i)} disabled={stops.length <= 2}>✕</button>
            </div>
        {/each}
    </div>

    <div class="mt-4">
        <pre class="overflow-x-auto rounded border border-brand-secondary bg-white/5 p-3 font-mono text-xs text-brand-text-highlight select-all">background: {cssValue()};</pre>
    </div>
</div>