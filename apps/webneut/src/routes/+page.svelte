<script lang="ts">
    import ControlPanel from '$lib/webneut/ControlPanel.svelte';
    import DownloadButton from '$lib/webneut/DownloadButton.svelte';
    import NeutrinoPlot from '$lib/webneut/NeutrinoPlot.svelte';
    import favicon from '$lib/assets/favicon.svg';
</script>

<svelte:head>
    <title>Webneut</title>
    <meta name="WebNeut" content="Cool neutrino oscillator" />
</svelte:head>

<div
    class="webneut-tool grid h-screen w-screen grid-cols-[1fr_2fr] grid-rows-[auto_auto] [grid-template-areas:'header_header'_'controls_plot']"
>
    <div
        class="header flex items-center justify-between border-b border-brand-secondary bg-brand-bg px-4 py-3 [grid-area:header]"
    >
        <h1 class="text-xl font-semibold text-brand-text-highlight">Webneut</h1>
        <div class="flex items-center gap-2">
            <DownloadButton />
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- cross-app link to portfolio root -->
            <a
                href="/"
                aria-label="Portfolio"
                class="inline-flex items-center justify-center overflow-hidden rounded-lg border border-brand-primary bg-transparent p-1.5 transition-colors duration-150 hover:bg-white/15 active:scale-[0.97]"
            >
                <img src={favicon} alt="Portfolio" class="h-6 w-6" />
            </a>
        </div>
    </div>

    <div class="plot [grid-area:plot]">
        <NeutrinoPlot />
    </div>

    <div class="controls @container overflow-y-scroll [grid-area:controls]">
        <ControlPanel />
    </div>
</div>

<style>
    @media (orientation: portrait) {
        .webneut-tool {
            display: flex;
            flex-direction: column;
        }
        .webneut-tool .plot,
        .webneut-tool .controls {
            flex: 1 1 500px;
        }
    }

    @media (max-height: 600px) {
        .header h1 {
            font-size: 1.2em;
        }
    }
</style>
