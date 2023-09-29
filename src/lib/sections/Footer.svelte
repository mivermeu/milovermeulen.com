<script lang='ts'>
    import Socials from "$lib/components/Socials.svelte";

    export let height: number = 300;
</script>

<div class='footer' bind:clientHeight={height} style='--height: {height}px;'>
    <div>
        © {new Date().getFullYear()} Milo Vermeulen
    </div>
    <div>
        Sources of inspiration: 
        <a href='https://fantinel.dev'>Matt Fantinel</a>,
        <a href='https://brittanychiang.com'>Brittany Chiang</a>,
        <a href='https://olaolu.dev'>Olaolu Olawuyi</a> and
        <a href='https://www.seanhalpin.xyz'>Séan Halpin</a>
    </div>
    <div>
        Icons by <a href='https://iconoir.com'>Iconoir</a>, <a href='https://www.svgrepo.com'>SVG repo</a> and myself.
    </div>
    <div class='socials-container'>
        <Socials />
    </div>
</div>

<style lang='scss'>
    .footer {
        width: 100%;
        height: 250px;
        margin-top: 100px;

        z-index: 2;
        pointer-events: none;

        display: flex;
        flex-direction: column;
        justify-content: end;
        align-content: center;
        text-align: center;
    }

    a {
        pointer-events: all;
    }

    .socials-container {
        margin-top: 40px;
        margin-bottom: 40px;
        margin-left: auto;
        margin-right: auto;
    }
</style>