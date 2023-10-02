<script lang='ts'>
    import Socials from "$lib/components/Socials.svelte";
    import TextScroll from "$lib/components/TextScroll.svelte";
    import headshot from '$lib/images/headshot-min.jpeg';

    export let height: number = 0;
</script>

<section id="hero" bind:clientHeight={height}>
    <h1>
        Hi, I'm Milo!<br>
        I do <TextScroll strings={['software engineering', 'data science', 'particle physics']} />
    </h1>
    <div id='about-container'>
        <p id='about'>
            I'm driven to contribute meaningfully to global challenges, leveraging
            expertise in physics, data science, and software engineering. I excel in
            big data science, high-performance code development and agile customer
            relations. I'm eager to bring this expertise to a forward-thinking team.
            Open to new opportunities — let's connect!
        </p>
        <div id='socials-container'>
            <Socials />
        </div>
        <img id='headshot' src={headshot} alt='hi' />
    </div>
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

    #about-container {
        display: grid;
        gap: 2em;
        grid-template-areas:
            'about headshot'
            'socials headshot';
        @media screen and (max-width: 750px) {
            grid-template-areas: 'about' 'socials' 'headshot';
        }
    }

    #about {
        grid-area: about;
        font-size: var(--font-size-topic);
        max-width: 30em;
    }
    
    #socials-container {
        grid-area: socials;
    }

    #headshot {
        grid-area: headshot;
        max-width: 300px;
        border-radius: 10px;
    }

    @media screen and (max-width: 750px) {
        #about {
            text-align: center;
        }

        #about-container {
            justify-items: center;
        }
    }
</style>
