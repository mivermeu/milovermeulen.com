<script lang="ts">
    import Hero from '$lib/sections/Hero.svelte';
    import Experience from '$lib/sections/Experience.svelte';
    import Education from '$lib/sections/Education.svelte';
</script>

<svelte:head>
    <title>Home</title>
    <meta name="description" content="Personal website" />
</svelte:head>

<div class="container">
    <Hero />
    <Experience />
    <Education />
</div>
