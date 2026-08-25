<script lang="ts">
    import '../app.css';
    import favicon from '$lib/assets/favicon.svg';
    import { resolve } from '$app/paths';

    let { children } = $props();
    let sidebarOpen = $state(false);

    const categories = [
        {
            name: 'Money',
            tools: [{ slug: 'settle-up', name: 'Settle Up' }]
        },
        {
            name: 'Generators',
            tools: [
                { slug: 'qr-code', name: 'QR Code' },
                { slug: 'uuid', name: 'UUID' },
                { slug: 'password-generator', name: 'Password Generator' },
                { slug: 'hash-generator', name: 'Hash Generator' }
            ]
        },
        {
            name: 'Text',
            tools: [
                { slug: 'markdown-editor', name: 'Markdown Editor' },
                { slug: 'diff', name: 'Text Diff' },
                { slug: 'regex-tester', name: 'Regex Tester' }
            ]
        },
        {
            name: 'Converters',
            tools: [
                { slug: 'base64', name: 'Base64' },
                { slug: 'csv-json', name: 'CSV ↔ JSON' },
                { slug: 'json-formatter', name: 'JSON Formatter' },
                { slug: 'jwt-decoder', name: 'JWT Decoder' }
            ]
        },
        {
            name: 'Design',
            tools: [
                { slug: 'color-palette', name: 'Color Palette' },
                { slug: 'gradient-generator', name: 'CSS Gradient' },
                { slug: 'contrast-checker', name: 'Contrast Checker' }
            ]
        },
        {
            name: 'Scheduling',
            tools: [{ slug: 'cron-visualizer', name: 'Cron Visualizer' }]
        }
    ];
</script>

<svelte:head>
    <title>Cool Tools</title>
</svelte:head>

<div class="flex min-h-dvh">
    <button
        class="fixed left-3 top-3 z-50 flex size-8 items-center justify-center rounded-md border border-brand-secondary bg-brand-bg text-brand-text md:hidden"
        onclick={() => sidebarOpen = !sidebarOpen}
        aria-label="Toggle navigation"
    >
        {sidebarOpen ? '✕' : '☰'}
    </button>

    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a href="/" aria-label="Portfolio" class="fixed right-3 top-3 z-50 inline-flex items-center justify-center overflow-hidden rounded-lg border border-brand-primary bg-transparent p-1.5 transition-colors duration-150 hover:bg-white/15 active:scale-[0.97]">
        <img src={favicon} alt="Portfolio" class="h-6 w-6" />
    </a>

    {#if sidebarOpen}
        <button
            aria-label="Close navigation"
            type="button"
            class="ct-overlay fixed inset-0 z-30 mt-0 border-0 bg-black/40 p-0 align-[normal] rounded-none md:hidden"
            onclick={() => sidebarOpen = false}
        ></button>
    {/if}

    <aside
        class="fixed inset-y-0 left-0 z-40 w-56 overflow-y-auto border-r border-brand-secondary bg-brand-bg p-4 pt-14 transition-transform md:static md:pt-4 {sidebarOpen ? 'translate-x-0 md:translate-x-0' : 'translate-x-[-100%] md:translate-x-0'}"
    >
        <a href={resolve('/')} class="mb-6 block text-lg font-bold text-brand-text-highlight" onclick={() => sidebarOpen = false}>Cool Tools</a>
        <nav class="flex flex-col gap-1">
            {#each categories as cat (cat.name)}
                <div class="mb-1 mt-3 flex items-center gap-2 first:mt-0">
                    <hr class="flex-1 border-t border-current opacity-20" />
                    <span class="text-[10px] font-normal tracking-wider uppercase opacity-40">{cat.name}</span>
                </div>
                {#each cat.tools as tool (tool.slug)}
                    <a
                        href={resolve('/tools/' + tool.slug)}
                        class="rounded px-2 py-1.5 text-sm text-brand-text transition-colors hover:bg-white/10 hover:text-brand-text-highlight"
                        onclick={() => sidebarOpen = false}
                    >
                        {tool.name}
                    </a>
                {/each}
            {/each}
        </nav>
    </aside>

    <main class="flex-1 px-4 pt-14 md:pt-4">
        {@render children()}
    </main>
</div>

<style>
    button.ct-overlay:active:not(:disabled) {
        transform: none;
    }
</style>