<script lang='ts'>
    import Socials from "$lib/components/Socials.svelte";
    import TextScroll from "$lib/components/TextScroll.svelte";
</script>

<section id="hero">
    <h1>Hi, I'm Milo!</h1>
    <p class="subtitle">
        I do <TextScroll strings={['software engineering', 'data science', 'particle physics']} />
    </p>
    <Socials />
</section>

<style lang="scss">
    #hero {
        padding: 80px;
        outline: solid;

        .subtitle {
            font-size: larger;
        }
    }
</style>
