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
    <p id='about'>
        I'm driven to contribute meaningfully to global challenges, leveraging
        expertise in physics, data science, and software engineering. I excel in
        big data science, high-performance code development and agile customer
        relations. I'm eager to bring this expertise to a forward-thinking team.
        Open to new opportunities — let's connect!
    </p>
    <Socials />
</section>

<style lang="scss">
    #hero {
        padding: 80px;
        pointer-events: none;
        z-index: 2;

        @media screen and (max-width: 750px) {
            padding: 0;
        }

        @media screen and (max-width: 350px) {
            h1 {
                font-size: calc(var(--font-size-title) / 1.3);
            }

            p {
                font-size: var(--font-size-text);
            }
        }
    }

    #about {
        font-size: var(--font-size-topic);
        max-width: 30em;
    }
</style>
