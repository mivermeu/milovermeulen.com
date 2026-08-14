<script lang="ts">
    import ControlPanel from '$lib/webneut/ControlPanel.svelte';
    import DownloadButton from '$lib/webneut/DownloadButton.svelte';
    import NeutrinoPlot from '$lib/webneut/NeutrinoPlot.svelte';
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
        <DownloadButton />
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
