<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';
    import CopyButton from '$lib/components/CopyButton.svelte';
    import CodeBlock from '$lib/components/CodeBlock.svelte';

    let input = $state('');
    let output = $state('');
    let error = $state('');

    function run(fn: (v: unknown) => string) {
        error = '';
        if (!input.trim()) return;
        try {
            output = fn(JSON.parse(input));
        } catch (e) {
            error = (e as Error).message;
        }
    }
    const format = () => run((v) => JSON.stringify(v, null, 2));
    const minify = () => run((v) => JSON.stringify(v));
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
</script>

<ToolShell title="JSON Formatter" desc="Format, validate, and minify JSON.">
    <textarea placeholder="Paste JSON here..." bind:value={input} class="mb-3 h-32 w-full"
    ></textarea>

    <div class="mb-4 flex flex-wrap gap-3">
        <button type="button" onclick={format}>Format</button>
        <button type="button" onclick={minify}>Minify</button>
        <button type="button" onclick={validate}>Validate</button>
        {#if output && !output.startsWith('✓')}
            <CopyButton value={output} label="Copy" />
        {/if}
    </div>

    {#if error}
        <p class="mb-3 text-sm text-red-400">{error}</p>
    {/if}

    {#if output}
        {#if output === '✓ Valid JSON'}
            <p class="text-sm text-green-400">{output}</p>
        {:else}
            <CodeBlock value={output} />
        {/if}
    {/if}
</ToolShell>
