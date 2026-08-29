<script lang="ts">
    import { resolve } from '$app/paths';
    import { categories } from '$lib/data/tools';
</script>

<div class="mx-auto max-w-5xl px-4 py-12">
    <h1 class="mb-2 text-3xl font-bold text-brand-text-highlight">Cool Tools</h1>
    <p class="mb-8 text-brand-text">
        A collection of free, client-side utilities. No sign-up, no tracking.
    </p>

    {#each categories as cat (cat.name)}
        <h2
            class="mt-10 mb-3 text-[10px] font-normal tracking-wider text-brand-text/60 uppercase first:mt-0"
        >
            {cat.name}
        </h2>
        <div class="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2 lg:grid-cols-3">
            {#each cat.tools as tool (tool.slug)}
                <a
                    href={resolve(`/tools/${tool.slug}`)}
                    class="block rounded-lg border border-brand-secondary bg-brand-bg p-4 transition-colors hover:border-brand-primary hover:bg-white/5"
                >
                    <h3
                        class="mt-0! mb-1! border-0! text-lg font-semibold text-brand-text-highlight"
                    >
                        {tool.name}
                    </h3>
                    <p class="mt-1 text-sm text-brand-text">{tool.desc}</p>
                </a>
            {/each}
        </div>
    {/each}
</div>
