<script lang="ts">
    let token = $state('');
    let header = $state('');
    let payload = $state('');
    let signature = $state('');
    let expiry = $state('');
    let error = $state('');

    function decode() {
        error = ''; header = ''; payload = ''; signature = ''; expiry = '';
        if (!token.trim()) return;
        const parts = token.trim().split('.');
        if (parts.length !== 3) { error = 'Invalid JWT: expected 3 parts separated by dots.'; return; }
        try {
            header = JSON.stringify(JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'))), null, 2);
            payload = JSON.stringify(JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))), null, 2);
            signature = parts[2];
            const p = JSON.parse(atob(parts[1]));
            if (p.exp) expiry = `Expires: ${new Date(p.exp * 1000).toISOString()}`;
            if (p.iat) expiry += (expiry ? ' | ' : '') + `Issued: ${new Date(p.iat * 1000).toISOString()}`;
        } catch (e) {
            error = 'Failed to decode: ' + (e as Error).message;
        }
    }
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">JWT Decoder</h1>
    <p class="mb-6 text-sm text-brand-text">Decode and inspect JSON Web Tokens (client-side only, no validation).</p>

    <textarea
        placeholder="Paste JWT here..."
        bind:value={token}
        class="mb-3 h-24 w-full font-mono text-xs"
    ></textarea>
    <button onclick={decode}>Decode</button>

    {#if error}
        <p class="mt-3 text-sm text-red-400">{error}</p>
    {/if}

    {#if header}
        <h3 class="mt-6">Header</h3>
        <pre class="overflow-x-auto rounded border border-brand-secondary bg-white/5 p-3 font-mono text-xs text-brand-text-highlight">{header}</pre>
    {/if}

    {#if payload}
        <h3 class="mt-6">Payload</h3>
        {#if expiry}
            <p class="mb-2 text-xs text-brand-text">{expiry}</p>
        {/if}
        <pre class="overflow-x-auto rounded border border-brand-secondary bg-white/5 p-3 font-mono text-xs text-brand-text-highlight">{payload}</pre>
    {/if}

    {#if signature}
        <h3 class="mt-6">Signature</h3>
        <pre class="overflow-x-auto rounded border border-brand-secondary bg-white/5 p-3 font-mono text-xs text-brand-text-highlight">{signature}</pre>
    {/if}
</div>