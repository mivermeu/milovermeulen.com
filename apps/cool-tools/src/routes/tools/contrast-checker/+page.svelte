<script lang="ts">
    let fg = $state('#000000');
    let bg = $state('#ffffff');

    function luminance(hex: string) {
        const v = parseInt(hex.replace('#', ''), 16);
        const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    let ratio = $derived(((Math.max(luminance(fg), luminance(bg)) + 0.05) / (Math.min(luminance(fg), luminance(bg)) + 0.05)).toFixed(2));

    let aaNorm = $derived(Number(ratio) >= 4.5);
    let aaLarge = $derived(Number(ratio) >= 3);
    let aaaNorm = $derived(Number(ratio) >= 7);
    let aaaLarge = $derived(Number(ratio) >= 4.5);
</script>

<div class="mx-auto max-w-xl px-4 py-8">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">WCAG Contrast Checker</h1>
    <p class="mb-6 text-sm text-brand-text">Check if two colors meet WCAG accessibility guidelines.</p>

    <div class="mb-6 flex items-center gap-6">
        <div>
            <label class="mb-1 block text-xs text-brand-text" for="fg">Foreground</label>
            <input id="fg" type="color" bind:value={fg} class="size-12 cursor-pointer rounded border-0 p-0.5" />
            <input type="text" bind:value={fg} class="mt-1 w-24 font-mono text-xs" />
        </div>
        <div>
            <label class="mb-1 block text-xs text-brand-text" for="bg">Background</label>
            <input id="bg" type="color" bind:value={bg} class="size-12 cursor-pointer rounded border-0 p-0.5" />
            <input type="text" bind:value={bg} class="mt-1 w-24 font-mono text-xs" />
        </div>
    </div>

    <div class="mb-4 rounded-lg border border-brand-secondary p-6 text-center" style="background: {bg};">
        <p class="text-lg font-bold" style="color: {fg}">Contrast Ratio: {ratio}:1</p>
        <p class="mt-2 text-sm" style="color: {fg}">Aa — The quick brown fox jumps over the lazy dog.</p>
    </div>

    <div class="rounded border border-brand-secondary bg-white/5 p-4 text-sm text-brand-text">
        <table class="w-full">
            <thead>
                <tr><th class="pb-1 text-left font-semibold">Level</th><th class="pb-1 text-left font-semibold">Normal</th><th class="pb-1 text-left font-semibold">Large</th></tr>
            </thead>
            <tbody>
                <tr>
                    <td>AA</td>
                    <td class:font-bold={aaNorm} class:text-green-400={aaNorm} class:text-red-400={!aaNorm}>{aaNorm ? '✓ Pass' : '✗ Fail'}</td>
                    <td class:font-bold={aaLarge} class:text-green-400={aaLarge} class:text-red-400={!aaLarge}>{aaLarge ? '✓ Pass' : '✗ Fail'}</td>
                </tr>
                <tr>
                    <td>AAA</td>
                    <td class:font-bold={aaaNorm} class:text-green-400={aaaNorm} class:text-red-400={!aaaNorm}>{aaaNorm ? '✓ Pass' : '✗ Fail'}</td>
                    <td class:font-bold={aaaLarge} class:text-green-400={aaaLarge} class:text-red-400={!aaaLarge}>{aaaLarge ? '✓ Pass' : '✗ Fail'}</td>
                </tr>
            </tbody>
        </table>
    </div>
</div>