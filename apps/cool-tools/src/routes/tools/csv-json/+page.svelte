<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';
    import Toggle from '$lib/components/Toggle.svelte';

    let input = $state('');
    let output = $state('');
    let delimiter = $state(',');
    let mode: 'csv-to-json' | 'json-to-csv' = $state('csv-to-json');
    let hasHeader = $state(true);

    function csvEscape(v: unknown) {
        const s = String(v ?? '');
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function convert() {
        if (!input.trim()) { output = ''; return; }
        try {
            if (mode === 'csv-to-json') {
                const lines = input.trim().split('\n').map((l) => l.split(delimiter).map((c) => c.trim()));
                if (lines.length < 1) { output = ''; return; }
                if (hasHeader && lines.length < 2) { output = '[]'; return; }
                const headers = hasHeader ? lines[0] : lines[0].map((_, i) => `col${i + 1}`);
                const rows = hasHeader ? lines.slice(1) : lines;
                output = JSON.stringify(rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))), null, 2);
            } else {
                const arr = JSON.parse(input.trim());
                if (!Array.isArray(arr) || arr.length === 0) { output = ''; return; }
                const headers = Object.keys(arr[0]);
                output = [headers.join(delimiter), ...arr.map((row) => headers.map((h) => csvEscape(row[h])).join(delimiter))].join('\n');
            }
        } catch (e) {
            output = 'Error: ' + (e as Error).message;
        }
    }
</script>

<ToolShell title="CSV ↔ JSON" desc="Convert between CSV and JSON formats.">
    <div class="mb-4 flex flex-wrap items-center gap-3">
        <Toggle
            value={mode}
            options={[{ value: 'csv-to-json', label: 'CSV → JSON' }, { value: 'json-to-csv', label: 'JSON → CSV' }]}
            onpick={(v) => mode = v as 'csv-to-json' | 'json-to-csv'}
        />
        {#if mode === 'csv-to-json'}
            <label class="text-sm text-brand-text" for="delim">Delimiter:</label>
            <input id="delim" type="text" bind:value={delimiter} class="w-12" maxlength="1" />
            <label class="text-sm text-brand-text">
                <input type="checkbox" bind:checked={hasHeader} /> Has header
            </label>
        {/if}
        <button type="button" onclick={convert}>Convert</button>
    </div>

    <textarea
        placeholder={mode === 'csv-to-json' ? 'Paste CSV here...' : 'Paste JSON array here...'}
        bind:value={input}
        class="mb-3 h-32 w-full font-mono text-xs"
    ></textarea>

    <textarea
        readonly
        bind:value={output}
        placeholder="Output"
        class="h-32 w-full font-mono text-xs"
    ></textarea>
</ToolShell>