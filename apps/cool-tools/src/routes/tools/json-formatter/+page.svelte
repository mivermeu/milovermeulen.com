<script lang="ts">
    let input = $state('');
    let output = $state('');
    let error = $state('');

    function format() {
        error = ''; output = '';
        if (!input.trim()) return;
        try {
            output = JSON.stringify(JSON.parse(input), null, 2);
        } catch (e) {
            error = (e as Error).message;
        }
    }

    function validate() {
        error = '';
        if (!input.trim()) return;
        try {
            JSON.parse(input);
            output = '✓ Valid JSON';
        } catch (e) {
            error = (e as Error).message;
        }
    }

    function copy() {
        navigator.clipboard.writeText(output);
    }

    function minify() {
        error = '';
        if (!input.trim()) return;
        try {
            output = JSON.stringify(JSON.parse(input));
        } catch (e) {
            error = (e as Error).message;
        }
    }
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">JSON Formatter</h1>
    <p class="mb-6 text-sm text-brand-text">Format, validate, and minify JSON.</p>

    <textarea
        placeholder="Paste JSON here..."
        bind:value={input}
        class="mb-3 h-32 w-full"
    ></textarea>

    <div class="mb-4 flex gap-3">
        <button onclick={format}>Format</button>
        <button onclick={minify}>Minify</button>
        <button onclick={validate}>Validate</button>
        {#if output && !output.startsWith('✓')}
            <button onclick={copy}>Copy</button>
        {/if}
    </div>

    {#if error}
        <p class="mb-3 text-sm text-red-400">{error}</p>
    {/if}

    {#if output}
        {#if output === '✓ Valid JSON'}
            <p class="text-sm text-green-400">{output}</p>
        {:else}
            <pre class="overflow-x-auto rounded border border-brand-secondary bg-white/5 p-3 font-mono text-xs text-brand-text-highlight">{output}</pre>
        {/if}
    {/if}
</div>