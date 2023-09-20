<script lang='ts'>
    import Hero from '$lib/sections/Hero.svelte';
    import Experience from '$lib/sections/Experience.svelte';
    import Projects from '$lib/sections/Projects.svelte';
    import AboutWebsite from '$lib/sections/AboutWebsite.svelte';
    import Footer from '$lib/sections/Footer.svelte';
</script>

<svelte:head>
    <title>Milo Vermeulen</title>
    <meta name='Milo Vermeulen' content='Personal website' />
</svelte:head>

<div class='app'>
    <main>
        <Hero />
        <Experience />
        <Projects />
        <AboutWebsite />
    </main>

    <Footer />
</div>

<style>
    .app {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
    }

    main {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding-left: 30px;
        padding-right: 30px;
        margin: auto;
        width: 100%;
        max-width: 1080px;
        box-sizing: border-box;
    }
</style>
