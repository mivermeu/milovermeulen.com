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
        height: 100vh;
        width: 100vw;

        display: grid;
        grid-template-columns: 1fr 2fr;
        grid-template-rows: auto auto;
        grid-template-areas:
            'header header'
            'controls plot';

        @media screen and (max-width: 1200px) {
            display: flex;
            flex-direction: column;

            .plot, .controls {
                flex: 1 1 500px;
            }
        }
    }

    .header {
        grid-area: header;

        display: flex;
        justify-content: space-between;

        background-color: #333;

        h1 {
            margin: 0.5em 1em;
        }
    }

    .plot {
        grid-area: plot;
    }

    .controls {
        grid-area: controls;
        overflow-y: scroll;

        container-type: inline-size;
    }
</style>
