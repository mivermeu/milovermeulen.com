<script lang='ts'>
    import Hero from '$lib/sections/Hero.svelte';
    import Experience from '$lib/sections/Experience.svelte';
    import Projects from '$lib/sections/Projects.svelte';
    import AboutWebsite from '$lib/sections/AboutWebsite.svelte';
    import Footer from '$lib/sections/Footer.svelte';
    import HexGrid from '$lib/components/HexGrid.svelte';
    import Education from '$lib/sections/Education.svelte';

    let hero_height: number = 0;
    let footer_height: number = 0;
</script>

<svelte:head>
    <title>Milo Vermeulen</title>
    <meta name='Milo Vermeulen' content='Personal website' />
</svelte:head>

<div class='app'>
    <HexGrid grid_height={hero_height} />

    <main>
        <Hero bind:height={hero_height}/>
        <Experience />
        <Education />
        <Projects />
        <AboutWebsite />
    </main>

    <Footer bind:height={footer_height} />
    <HexGrid bind:grid_height={footer_height} bottom={0} />
</div>

<style>
    .app {
        position: relative;
        display: flex;
        flex-direction: column;
        min-height: 100vh;
    }

    main {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 0 20px;
        margin: auto;
        width: 100%;
        max-width: 1080px;
        box-sizing: border-box;
    }
</style>
