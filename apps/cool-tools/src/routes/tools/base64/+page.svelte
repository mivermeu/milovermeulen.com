<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';
    import CopyButton from '$lib/components/CopyButton.svelte';
    import FilePick from '$lib/components/FilePick.svelte';
    import Toggle from '$lib/components/Toggle.svelte';
    import { encodeUtf8, decodeUtf8, encodeArrayBuffer } from '$lib/base64';

    let input = $state('');
    let output = $state('');
    let mode: 'encode' | 'decode' = $state('encode');

    function onPick(v: string) {
        mode = v as 'encode' | 'decode';
        convert();
    }

    function convert() {
        if (!input) { output = ''; return; }
        try {
            output = mode === 'encode' ? encodeUtf8(input) : decodeUtf8(input);
        } catch {
            output = mode === 'encode' ? 'Input too large to encode in memory.' : 'Invalid input';
        }
    }

    function onFile(file: File) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                output = encodeArrayBuffer(reader.result as ArrayBuffer);
                mode = 'encode';
            } catch {
                output = 'Input too large to encode in memory.';
            }
        };
        reader.readAsArrayBuffer(file);
    }
</script>

<ToolShell title="Base64 Encoder / Decoder" desc="Encode text or files to Base64, or decode Base64 back to text.">
    <div class="mb-4 flex items-center gap-3">
        <Toggle
            value={mode}
            options={[{ value: 'encode', label: 'Encode' }, { value: 'decode', label: 'Decode' }]}
            onpick={onPick}
        />
        <FilePick onfile={onFile} />
    </div>

    <textarea
        placeholder={mode === 'encode' ? 'Text to encode...' : 'Base64 to decode...'}
        bind:value={input}
        oninput={convert}
        class="mb-3 h-32 w-full"
    ></textarea>

    <div class="mb-1 flex justify-end">
        <CopyButton value={output} />
    </div>
    <textarea
        readonly
        value={output}
        placeholder="Output"
        class="h-32 w-full"
    ></textarea>
</ToolShell>