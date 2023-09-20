<script lang='ts'>
    import Socials from "$lib/components/Socials.svelte";
</script>

<div class='footer'>
    <div>
        © {new Date().getFullYear()} Milo Vermeulen
    </div>
    <Socials />
</div>

<style lang='scss'>
    .footer {
        outline: white 1px solid;
        width: 100%;
        height: 300px;
        margin-top: 100px;

        display: flex;
        flex-direction: column;
        justify-content: space-evenly;
        align-content: center;
        text-align: center;
    }
</style>