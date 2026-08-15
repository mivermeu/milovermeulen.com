<script lang="ts">
    import '../app.css';
    import favicon from '$lib/assets/favicon.svg';

    let { children } = $props();
</script>

<svelte:head>
    <title>Milo Vermeulen — Software Engineer</title>
    <meta name="description" content="Full-stack engineer. Particle physics PhD. CERN, ESA, proton therapy, web." />
    <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
