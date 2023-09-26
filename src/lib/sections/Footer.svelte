<script lang='ts'>
    import Socials from "$lib/components/Socials.svelte";

    export let height: number = 300;
</script>

<div class='footer' bind:clientHeight={height} style='--height: {height}px;'>
    <div>
        © {new Date().getFullYear()} Milo Vermeulen
    </div>
    <Socials />
</div>

<style lang='scss'>
    .footer {
        width: 100%;
        height: 200px;
        margin-top: 100px;

        z-index: 2;
        pointer-events: none;

        display: flex;
        flex-direction: column;
        justify-content: space-evenly;
        align-content: center;
        text-align: center;
    }
</style>