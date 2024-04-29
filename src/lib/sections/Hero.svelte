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
            I like to work on meaningful challenges and have some fun along the way,
            combining my background in physics with my software engineering skills.
            In the past I've worked on particle detectors at CERN and ESA satellite
            missions, and I currently work in medical physics at the New York Proton
            Center.
        </p>
        <div id='socials-container'>
            <Socials />
        </div>
        <img id='headshot' src={headshot} alt='Milo Vermeulen' width='300px' height='431px' />
    </div>
</section>

<style lang="scss">
    section {
        margin-bottom: 5em;
    }
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
