<script lang="ts">
    import '../app.css';
    import favicon from '$lib/assets/favicon.svg';
    import Noise from '$lib/components/Noise.svelte';

    let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="relative min-h-screen w-full overflow-x-hidden bg-[#222] text-white">
    <!-- Global glow -->
    <div
        class="pointer-events-none fixed top-0 left-full z-100 h-[300%] w-[400%] -translate-x-1/2 -translate-y-1/2 rounded-full
        bg-radial from-white/20 via-transparent to-transparent blur-[120px]"
    ></div>
    <Noise />

    {@render children()}
</div>
