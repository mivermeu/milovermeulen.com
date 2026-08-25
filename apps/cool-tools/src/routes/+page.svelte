<script lang="ts">
    const tools = [
        { slug: 'settle-up', name: 'Settle Up', desc: 'Split expenses and minimize transfers' },
        { slug: 'qr-code', name: 'QR Code Generator', desc: 'Generate QR codes from text or URLs' },
        { slug: 'json-formatter', name: 'JSON Formatter', desc: 'Format, validate, and explore JSON' },
        { slug: 'regex-tester', name: 'Regex Tester', desc: 'Test regular expressions with live matching' },
        { slug: 'color-palette', name: 'Color Palette', desc: 'Generate color palettes and convert formats' },
        { slug: 'password-generator', name: 'Password Generator', desc: 'Generate cryptographically secure passwords' },
        { slug: 'markdown-editor', name: 'Markdown Editor', desc: 'Write markdown with live preview' },
        { slug: 'base64', name: 'Base64 Encoder', desc: 'Encode and decode Base64 text and files' },
        { slug: 'uuid', name: 'UUID Generator', desc: 'Generate v4 UUIDs' },
        { slug: 'jwt-decoder', name: 'JWT Decoder', desc: 'Decode and inspect JSON Web Tokens' },
        { slug: 'cron-visualizer', name: 'Cron Visualizer', desc: 'Parse cron expressions and see schedules' },
        { slug: 'diff', name: 'Text Diff', desc: 'Compare two texts side by side' },
        { slug: 'hash-generator', name: 'Hash Generator', desc: 'Generate SHA-256, MD5, and other hashes' },
        { slug: 'csv-json', name: 'CSV ↔ JSON', desc: 'Convert between CSV and JSON formats' },
        { slug: 'gradient-generator', name: 'CSS Gradient', desc: 'Visual CSS gradient editor' },
        { slug: 'contrast-checker', name: 'Contrast Checker', desc: 'Check WCAG color contrast ratios' }
    ];
</script>

<div class="mx-auto max-w-5xl px-4 py-12">
    <h1 class="mb-2 text-3xl font-bold text-brand-text-highlight">Cool Tools</h1>
    <p class="mb-8 text-brand-text">A collection of free, client-side utilities. No sign-up, no tracking.</p>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each tools as tool}
            <a
                href="/cool-tools/tools/{tool.slug}"
                class="block rounded-lg border border-brand-secondary bg-brand-bg p-4 transition-colors hover:border-brand-primary hover:bg-white/5"
            >
                <h2 class="text-lg font-semibold text-brand-text-highlight">{tool.name}</h2>
                <p class="mt-1 text-sm text-brand-text">{tool.desc}</p>
            </a>
        {/each}
    </div>
</div>
