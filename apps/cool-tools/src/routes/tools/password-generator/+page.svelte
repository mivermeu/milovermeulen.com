<script lang="ts">
    import ToolShell from '$lib/components/ToolShell.svelte';
    import CopyButton from '$lib/components/CopyButton.svelte';

    let length = $state(20);
    let upper = $state(true);
    let lower = $state(true);
    let digits = $state(true);
    let symbols = $state(false);
    let password = $state('');

    function generate() {
        const sets = [
            [upper, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
            [lower, 'abcdefghijklmnopqrstuvwxyz'],
            [digits, '0123456789'],
            [symbols, '!@#$%^&*()_+-=[]{}|;:,.<>?']
        ] as const;
        const chars = sets
            .filter(([enabled]) => enabled)
            .map(([, cs]) => cs)
            .join('');
        if (!chars) return;
        const rand = new Uint8Array(length);
        crypto.getRandomValues(rand);
        password = Array.from(rand, (b) => chars[b % chars.length]).join('');
    }

    let strength = $derived.by(() => {
        if (!password) return '';
        const s = password.length;
        let types = 0;
        if (/[A-Z]/.test(password)) types++;
        if (/[a-z]/.test(password)) types++;
        if (/\d/.test(password)) types++;
        if (/[^A-Za-z0-9]/.test(password)) types++;
        const score = s * types;
        if (score < 30) return 'weak';
        if (score < 60) return 'fair';
        if (score < 100) return 'strong';
        return 'very strong';
    });
</script>

<ToolShell
    title="Password Generator"
    desc="Cryptographically secure passwords via crypto.getRandomValues()."
>
    <div class="mb-4 flex items-center gap-3">
        <label class="text-sm text-brand-text" for="plen">Length:</label>
        <input id="plen" type="number" min="4" max="128" bind:value={length} class="w-20" />
        <button type="button" onclick={generate}>Generate</button>
        {#if password}
            <CopyButton value={password} label="Copy" />
        {/if}
    </div>

    <div class="mb-4 flex flex-wrap gap-4 text-sm text-brand-text">
        <label><input type="checkbox" bind:checked={upper} /> Uppercase</label>
        <label><input type="checkbox" bind:checked={lower} /> Lowercase</label>
        <label><input type="checkbox" bind:checked={digits} /> Digits</label>
        <label><input type="checkbox" bind:checked={symbols} /> Symbols</label>
    </div>

    {#if password}
        <div
            class="mb-2 rounded border border-brand-secondary bg-white/5 p-3 font-mono text-lg tracking-wider break-all text-brand-text-highlight select-all"
        >
            {password}
        </div>
        <div class="text-sm text-brand-text">
            Strength: <span
                class="capitalize {strength === 'very strong' || strength === 'strong'
                    ? 'text-green-400'
                    : strength === 'fair'
                      ? 'text-yellow-400'
                      : 'text-red-400'}">{strength}</span
            >
        </div>
    {/if}
</ToolShell>
