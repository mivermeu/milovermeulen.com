<script lang="ts">
    let input = $state('');
    let output = $state('');
    let delimiter = $state(',');
    let mode: 'csv-to-json' | 'json-to-csv' = $state('csv-to-json');
    let hasHeader = $state(true);

    function setCsvMode() { mode = 'csv-to-json'; }
    function setJsonMode() { mode = 'json-to-csv'; }

    function convert() {
        if (!input.trim()) { output = ''; return; }
        try {
            if (mode === 'csv-to-json') {
                const lines = input.trim().split('\n').map((l) => l.split(delimiter).map((c) => c.trim()));
                if (lines.length < 1) { output = ''; return; }
                if (hasHeader && lines.length < 2) { output = '[]'; return; }
                const headers = hasHeader ? lines[0] : lines[0].map((_, i) => `col${i + 1}`);
                const rows = hasHeader ? lines.slice(1) : lines;
                const json = rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));
                output = JSON.stringify(json, null, 2);
            } else {
                const arr = JSON.parse(input.trim());
                if (!Array.isArray(arr) || arr.length === 0) { output = ''; return; }
                const headers = Object.keys(arr[0]);
                const lines = [headers.join(delimiter), ...arr.map((row) => headers.map((h) => (row[h] ?? '').includes(delimiter) ? `"${row[h]}"` : row[h] ?? '').join(delimiter))];
                output = lines.join('\n');
            }
        } catch (e) {
            output = 'Error: ' + (e as Error).message;
        }
    }
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">CSV ↔ JSON</h1>
    <p class="mb-6 text-sm text-brand-text">Convert between CSV and JSON formats.</p>

    <div class="mb-4 flex flex-wrap items-center gap-3">
        <button onclick={setCsvMode} class={mode === 'csv-to-json' ? 'bg-white/10' : ''}>CSV → JSON</button>
        <button onclick={setJsonMode} class={mode === 'json-to-csv' ? 'bg-white/10' : ''}>JSON → CSV</button>
        {#if mode === 'csv-to-json'}
            <label class="text-sm text-brand-text" for="delim">Delimiter:</label>
            <input id="delim" type="text" bind:value={delimiter} class="w-12" maxlength="1" />
            <label class="text-sm text-brand-text">
                <input type="checkbox" bind:checked={hasHeader} /> Has header
            </label>
        {/if}
        <button onclick={convert}>Convert</button>
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
</div>