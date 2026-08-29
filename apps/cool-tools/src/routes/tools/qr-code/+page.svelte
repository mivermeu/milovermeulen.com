<script lang="ts">
    import QRCode from 'qrcode';
    import ToolShell from '$lib/components/ToolShell.svelte';

    let text = $state('');
    let dataUrl = $state('');
    let error = $state('');
    let size = $state(256);
    let ecc: 'L' | 'M' | 'Q' | 'H' = $state('M');
    let showSizeTip = $state(false);
    let showEccTip = $state(false);

    async function generate() {
        error = '';
        dataUrl = '';
        if (!text.trim()) return;
        try {
            dataUrl = await QRCode.toDataURL(text, { width: size, errorCorrectionLevel: ecc });
        } catch (e) {
            error = (e as Error).message;
        }
    }

    function download(format: 'png' | 'svg') {
        if (!dataUrl) return;
        if (format === 'png') {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = 'qrcode.png';
            a.click();
        } else {
            QRCode.toString(text, { type: 'svg', errorCorrectionLevel: ecc }).then((svg) => {
                const blob = new Blob([svg], { type: 'image/svg+xml' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'qrcode.svg';
                a.click();
                URL.revokeObjectURL(a.href);
            });
        }
    }
</script>

<ToolShell title="QR Code Generator" desc="Generate QR codes from text or URLs." max="max-w-xl">
    <div class="mb-3 flex items-center gap-3">
        <input type="text" placeholder="Text or URL..." bind:value={text} class="flex-1" />
        <button type="button" onclick={generate}>Generate</button>
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-4 text-sm text-brand-text">
        <label class="flex items-center gap-1"
            >Size:
            <input type="number" bind:value={size} min="128" max="1024" step="64" class="w-20" />
            <span class="relative inline-flex">
                <button
                    type="button"
                    class="size-4 p-0 text-xs leading-none"
                    onclick={() => (showSizeTip = !showSizeTip)}
                    onmouseenter={() => (showSizeTip = true)}
                    onmouseleave={() => (showSizeTip = false)}>?</button
                >
                {#if showSizeTip}
                    <span
                        class="absolute bottom-full left-1/2 z-50 mb-1 w-36 -translate-x-1/2 rounded bg-black/80 px-2 py-1 text-center text-[10px] text-white"
                        >Higher = sharper but larger file.</span
                    >
                {/if}
            </span>
        </label>
        <label class="flex items-center gap-1"
            >ECC:
            <select bind:value={ecc}>
                <option value="L">L</option>
                <option value="M">M</option>
                <option value="Q">Q</option>
                <option value="H">H</option>
            </select>
            <span class="relative inline-flex">
                <button
                    type="button"
                    class="size-4 p-0 text-xs leading-none"
                    onclick={() => (showEccTip = !showEccTip)}
                    onmouseenter={() => (showEccTip = true)}
                    onmouseleave={() => (showEccTip = false)}>?</button
                >
                {#if showEccTip}
                    <span
                        class="absolute bottom-full left-1/2 z-50 mb-1 w-44 -translate-x-1/2 rounded bg-black/80 px-2 py-1 text-center text-[10px] text-white"
                        >Error correction: L=7%, M=15%, Q=25%, H=30%. Higher = more damage
                        tolerance, denser QR.</span
                    >
                {/if}
            </span>
        </label>
    </div>

    {#if error}
        <p class="mb-3 text-sm text-red-400">{error}</p>
    {/if}

    {#if dataUrl}
        <div class="flex flex-col items-center gap-3">
            <img src={dataUrl} alt="QR Code" class="rounded-lg border border-brand-secondary" />
            <div class="flex gap-2">
                <button type="button" onclick={() => download('png')}>Download PNG</button>
                <button type="button" onclick={() => download('svg')}>Download SVG</button>
            </div>
        </div>
    {/if}
</ToolShell>
