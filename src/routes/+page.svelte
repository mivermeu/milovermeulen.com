<script lang="ts">
    import Hero from '$lib/sections/Hero.svelte';
    import Experience from '$lib/sections/Experience.svelte';
    import Projects from '$lib/sections/Projects.svelte';
    import Contact from '$lib/sections/Contact.svelte';
</script>

<svelte:head>
    <title>Milo Vermeulen</title>
    <meta name="Milo Vermeulen" content="Personal website" />
</svelte:head>

<div class="container">
    <Hero />
    <Experience />
    <Projects />
    <Contact />
</div>
