<script lang='ts'>
    import Socials from "$lib/components/Socials.svelte";
    import TextScroll from "$lib/components/TextScroll.svelte";

    export let height: number = 0;
</script>

<section id="hero" bind:clientHeight={height}>
    <h1>
        Hi, I'm Milo!<br>
        I do <TextScroll strings={['software engineering', 'data science', 'particle physics']} />
    </h1>
    <Socials />
</section>

<style lang="scss">
    #hero {
        padding: 80px;
        pointer-events: none;
        z-index: 2;
    }
</style>
