<script lang='ts'>
    import Hero from '$lib/sections/Hero.svelte';
    import Experience from '$lib/sections/Experience.svelte';
    import Projects from '$lib/sections/Projects.svelte';
    import AboutWebsite from '$lib/sections/AboutWebsite.svelte';
    import Footer from '$lib/sections/Footer.svelte';
    import HexGrid from '$lib/components/HexGrid.svelte';
    import Education from '$lib/sections/Education.svelte';
    import DevBar from '$lib/components/DevBar.svelte';
    import ThemePicker from '$lib/components/ThemePicker.svelte';

    let hero_height: number = 0;
    let footer_height: number = 0;

    const keywords: string = `
        Milo Vermeulen, software engineer, particle physics, physicist,
        data science, data analysis, PhD, web development, open to work
    `
</script>

<svelte:head>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-TCW9GRNQKP"></script>
    <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-TCW9GRNQKP');
    </script>

    <title>Milo Vermeulen</title>
    <meta name='author' content='Milo Vermeulen' />
    <meta name='description' content='Milo Vermeulen s personal website' />
    <meta name='keywords' content={keywords} />
</svelte:head>

<div class='app'>
    <DevBar />
    <HexGrid grid_height={hero_height} />
    <ThemePicker />

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
