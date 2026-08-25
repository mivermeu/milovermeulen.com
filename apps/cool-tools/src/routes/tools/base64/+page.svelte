<script lang="ts">
    let input = $state('');
    let output = $state('');
    let mode: 'encode' | 'decode' = $state('encode');

    function setEncode() { mode = 'encode'; convert(); }
    function setDecode() { mode = 'decode'; convert(); }

    function convert() {
        if (!input) { output = ''; return; }
        try {
            if (mode === 'encode') {
                output = btoa(new TextEncoder().encode(input).reduce((s, b) => s + String.fromCharCode(b), ''));
            } else {
                output = new TextDecoder().decode(Uint8Array.from(atob(input), (c) => c.charCodeAt(0)));
            }
        } catch { output = 'Invalid input'; }
    }

    function handleFile(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const bytes = new Uint8Array(reader.result as ArrayBuffer);
            output = btoa(bytes.reduce((s, b) => s + String.fromCharCode(b), ''));
            mode = 'encode';
        };
        reader.readAsArrayBuffer(file);
    }
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">Base64 Encoder / Decoder</h1>
    <p class="mb-6 text-sm text-brand-text">Encode text or files to Base64, or decode Base64 back to text.</p>

    <div class="mb-4 flex items-center gap-3">
        <button onclick={setEncode} class={mode === 'encode' ? 'bg-white/10' : ''}>Encode</button>
        <button onclick={setDecode} class={mode === 'decode' ? 'bg-white/10' : ''}>Decode</button>
        <label>
            <button class="relative cursor-pointer">
                Load File
                <input type="file" onchange={handleFile} class="absolute inset-0 cursor-pointer opacity-0" />
            </button>
        </label>
    </div>

    <textarea
        placeholder={mode === 'encode' ? 'Text to encode...' : 'Base64 to decode...'}
        bind:value={input}
        oninput={convert}
        class="mb-3 h-32 w-full"
    ></textarea>

    <textarea
        readonly
        value={output}
        placeholder="Output"
        class="h-32 w-full"
    ></textarea>
</div>