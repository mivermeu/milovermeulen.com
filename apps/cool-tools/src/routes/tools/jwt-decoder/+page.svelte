<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';
    import CodeBlock from '$lib/components/CodeBlock.svelte';
    import { b64urlToJson } from '$lib/jwt';

    let token = $state('');
    let header = $state('');
    let payload = $state('');
    let signature = $state('');
    let expiry = $state('');
    let error = $state('');

    function decode() {
        error = '';
        header = '';
        payload = '';
        signature = '';
        expiry = '';
        if (!token.trim()) return;
        const parts = token.trim().split('.');
        if (parts.length !== 3) {
            error = 'Invalid JWT: expected 3 parts separated by dots.';
            return;
        }
        try {
            header = JSON.stringify(b64urlToJson(parts[0]), null, 2);
            const p = b64urlToJson(parts[1]) as Record<string, unknown>;
            payload = JSON.stringify(p, null, 2);
            signature = parts[2];
            if (p.exp) expiry = `Expires: ${new Date(Number(p.exp) * 1000).toISOString()}`;
            if (p.iat)
                expiry +=
                    (expiry ? ' | ' : '') +
                    `Issued: ${new Date(Number(p.iat) * 1000).toISOString()}`;
        } catch (e) {
            error = 'Failed to decode: ' + (e as Error).message;
        }
    }
</script>

<ToolShell
    title="JWT Decoder"
    desc="Decode and inspect JSON Web Tokens (client-side only, no validation)."
>
    <textarea
        placeholder="Paste JWT here..."
        bind:value={token}
        class="mb-3 h-24 w-full font-mono text-xs"
    ></textarea>
    <button type="button" onclick={decode}>Decode</button>

    {#if error}
        <p class="mt-3 text-sm text-red-400">{error}</p>
    {/if}

    {#if header}
        <h3 class="mt-6">Header</h3>
        <CodeBlock value={header} />
    {/if}

    {#if payload}
        <h3 class="mt-6">Payload</h3>
        {#if expiry}
            <p class="mb-2 text-xs text-brand-text">{expiry}</p>
        {/if}
        <CodeBlock value={payload} />
    {/if}

    {#if signature}
        <h3 class="mt-6">Signature</h3>
        <CodeBlock value={signature} select={false} />
    {/if}
</ToolShell>
