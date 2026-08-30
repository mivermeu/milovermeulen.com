<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';
    import Toggle from '$lib/components/Toggle.svelte';
    import { csvToJson, jsonToCsv } from '$lib/csv';

    let input = $state('');
    let output = $state('');
    let delimiter = $state(',');
    let mode: 'csv-to-json' | 'json-to-csv' = $state('csv-to-json');
    let hasHeader = $state(true);

    function convert() {
        if (!input.trim()) {
            output = '';
            return;
        }
        try {
            output =
                mode === 'csv-to-json'
                    ? csvToJson(input, delimiter, hasHeader)
                    : jsonToCsv(input, delimiter);
        } catch (e) {
            output = 'Error: ' + (e as Error).message;
        }
    }
</script>

<ToolShell title="CSV ↔ JSON" desc="Convert between CSV and JSON formats.">
    <div class="mb-4 flex flex-wrap items-center gap-3">
        <Toggle
            value={mode}
            options={[
                { value: 'csv-to-json', label: 'CSV → JSON' },
                { value: 'json-to-csv', label: 'JSON → CSV' }
            ]}
            onpick={(v) => (mode = v as 'csv-to-json' | 'json-to-csv')}
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
