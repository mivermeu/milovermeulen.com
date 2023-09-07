<script lang='ts'>
    import ControlPanel from '$lib/webneut/ControlPanel.svelte';
    import DownloadButton from '$lib/webneut/DownloadButton.svelte';
    import NeutrinoPlot from '$lib/webneut/NeutrinoPlot.svelte';
</script>

<svelte:head>
    <title>Webneut</title>
    <meta name='WebNeut' content='Cool neutrino oscillator' />
</svelte:head>

<div class='webneut-tool'>
    <div class='header'>
        <h1>Webneut</h1>
        <DownloadButton />
    </div>

    <div class='plot'>
        <NeutrinoPlot />
    </div>

    <div class='controls'>
        <ControlPanel />
    </div>
</div>

<style lang='scss'>
    .webneut-tool {
        margin: 0;
        height: 100vh;
        width: 100vw;

        display: grid;
        grid-template-columns: 1fr 3fr;
        grid-template-rows: auto auto;
        grid-template-areas:
            'header header'
            'controls plot';
    }

    .header {
        margin: 0;
        grid-area: header;

        display: flex;
        justify-content: space-between;
    }

    .plot {
        margin: 0;
        grid-area: plot;
    }

    .controls {
        margin: 0;
        padding: 10px;
        grid-area: controls;
        overflow-y: auto;
    }
</style>
