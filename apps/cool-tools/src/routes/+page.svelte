<script lang="ts">
    import { resolve } from '$app/paths';

    const categories = [
        {
            name: 'Money',
            tools: [{ slug: 'settle-up', name: 'Settle Up', desc: 'Split expenses and minimize transfers' }]
        },
        {
            name: 'Generators',
            tools: [
                { slug: 'qr-code', name: 'QR Code Generator', desc: 'Generate QR codes from text or URLs' },
                { slug: 'uuid', name: 'UUID Generator', desc: 'Generate v4 UUIDs' },
                { slug: 'password-generator', name: 'Password Generator', desc: 'Generate cryptographically secure passwords' },
                { slug: 'hash-generator', name: 'Hash Generator', desc: 'Generate SHA-256, MD5, and other hashes' }
            ]
        },
        {
            name: 'Text',
            tools: [
                { slug: 'markdown-editor', name: 'Markdown Editor', desc: 'Write markdown with live preview' },
                { slug: 'diff', name: 'Text Diff', desc: 'Compare two texts side by side' },
                { slug: 'regex-tester', name: 'Regex Tester', desc: 'Test regular expressions with live matching' }
            ]
        },
        {
            name: 'Converters',
            tools: [
                { slug: 'base64', name: 'Base64 Encoder', desc: 'Encode and decode Base64 text and files' },
                { slug: 'csv-json', name: 'CSV ↔ JSON', desc: 'Convert between CSV and JSON formats' },
                { slug: 'json-formatter', name: 'JSON Formatter', desc: 'Format, validate, and explore JSON' },
                { slug: 'jwt-decoder', name: 'JWT Decoder', desc: 'Decode and inspect JSON Web Tokens' }
            ]
        },
        {
            name: 'Design',
            tools: [
                { slug: 'color-palette', name: 'Color Palette', desc: 'Generate color palettes and convert formats' },
                { slug: 'gradient-generator', name: 'CSS Gradient', desc: 'Visual CSS gradient editor' },
                { slug: 'contrast-checker', name: 'Contrast Checker', desc: 'Check WCAG color contrast ratios' }
            ]
        },
        {
            name: 'Scheduling',
            tools: [{ slug: 'cron-visualizer', name: 'Cron Visualizer', desc: 'Parse cron expressions and see schedules' }]
        }
    ];
</script>

<div class="mx-auto max-w-5xl px-4 py-12">
    <h1 class="mb-2 text-3xl font-bold text-brand-text-highlight">Cool Tools</h1>
    <p class="mb-8 text-brand-text">A collection of free, client-side utilities. No sign-up, no tracking.</p>

    {#each categories as cat (cat.name)}
        <h2 class="mb-3 mt-10 text-[10px] font-normal uppercase tracking-wider text-brand-text/60 first:mt-0">{cat.name}</h2>
        <div class="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2 lg:grid-cols-3">
            {#each cat.tools as tool (tool.slug)}
                <a
                    href={resolve('/tools/' + tool.slug)}
                    class="block rounded-lg border border-brand-secondary bg-brand-bg p-4 transition-colors hover:border-brand-primary hover:bg-white/5"
                >
                    <h3 class="!mb-1 !mt-0 !border-0 text-lg font-semibold text-brand-text-highlight">{tool.name}</h3>
                    <p class="mt-1 text-sm text-brand-text">{tool.desc}</p>
                </a>
            {/each}
        </div>
    {/each}
</div>
