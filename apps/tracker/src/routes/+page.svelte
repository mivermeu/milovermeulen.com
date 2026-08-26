<script lang="ts">
    import favicon from '$lib/assets/favicon.svg';
</script>

<svelte:head>
    <title>Satellite Tracker</title>
</svelte:head>

<div
    class="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-brand-bg text-brand-text"
>
    <a
        href="/"
        aria-label="Portfolio"
        class="inline-flex items-center justify-center overflow-hidden rounded-lg border border-brand-primary bg-transparent p-1.5 transition-colors duration-150 hover:bg-white/15 active:scale-[0.97]"
    >
        <img src={favicon} alt="Portfolio" class="h-6 w-6" />
    </a>
    <h1 class="text-2xl font-semibold text-brand-text-highlight">Satellite Tracker</h1>
</div>