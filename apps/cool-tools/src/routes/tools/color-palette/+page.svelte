<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';

    let hex = $state('#ff6b6b');
    let palette: { name: string; colors: string[] }[] = $state([]);
    let copiedKey = $state('');

    function hexToRgb(h: string) {
        const v = parseInt(h.replace('#', ''), 16);
        return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }

    function rgbToHsl([r, g, b]: number[]) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let h = 0, s = 0, l = (mx + mn) / 2;
        if (mx !== mn) {
            const d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (mx === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
        }
        return [h * 360, s * 100, l * 100];
    }

    function hslToHex(h: number, s: number, l: number) {
        s /= 100; l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = (n: number) => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    let current = $derived.by(() => {
        const [r, g, b] = hexToRgb(hex);
        const [h, s, l] = rgbToHsl([r, g, b]);
        return `rgb(${r}, ${g}, ${b}) = hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
    });

    function generate() {
        const [h, s, l] = rgbToHsl(hexToRgb(hex));
        palette = [
            { name: 'Complementary', colors: [hslToHex((h + 180) % 360, s, l)] },
            { name: 'Analogous', colors: [hslToHex((h + 30) % 360, s, l), hslToHex((h - 30 + 360) % 360, s, l)] },
            { name: 'Triadic', colors: [hslToHex((h + 120) % 360, s, l), hslToHex((h + 240) % 360, s, l)] },
            { name: 'Split Complementary', colors: [hslToHex((h + 150) % 360, s, l), hslToHex((h + 210) % 360, s, l)] }
        ];
    }

    async function copyColor(c: string, key: string) {
        await navigator.clipboard.writeText(c);
        copiedKey = key;
        setTimeout(() => { if (copiedKey === key) copiedKey = ''; }, 1000);
    }
</script>

<ToolShell title="Color Palette Generator" desc="Generate color harmonies from any color.">
    <div class="mb-6 flex items-center gap-3">
        <input type="color" bind:value={hex} onchange={generate} class="size-10 cursor-pointer rounded border-0 p-0.5" />
        <input type="text" bind:value={hex} class="w-28 font-mono" />
        <button type="button" onclick={generate}>Generate</button>
    </div>

    <div class="mb-4 text-xs text-brand-text">
        <p><span class="font-mono text-brand-text-highlight">{hex}</span> = {current}</p>
    </div>

    {#if palette.length > 0}
        <div class="flex flex-col gap-4">
            {#each palette as group (group.name)}
                <div>
                    <h3 class="!mb-2 !border-0">{group.name}</h3>
                    <div class="flex flex-wrap gap-3">
                        {#each group.colors as c, ci (c)}
                            {@const idx = group.name + ci}
                            <div class="flex flex-col items-center gap-1">
                                <div class="size-14 rounded-md border border-white/20" style="background: {c}"></div>
                                <button type="button" class="px-2 py-0.5 text-[10px]" onclick={() => copyColor(c, idx)}>
                                    {copiedKey === idx ? 'Copied!' : c}
                                </button>
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</ToolShell>