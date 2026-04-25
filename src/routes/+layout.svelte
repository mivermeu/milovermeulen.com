<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Noise from '$lib/components/Noise.svelte';
	import BracketedSection from '$lib/components/BracketedSection.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="relative min-h-screen w-full overflow-x-hidden bg-[#222] text-white">
	<div
		class="pointer-events-none fixed top-0 left-full z-0 h-[300%] w-[400%] -translate-x-1/2 -translate-y-1/2 rounded-full
		bg-radial from-white/10 via-transparent to-transparent blur-[120px]"
	></div>

	<Noise opacity={0.2} isFixed={false} className="z-100" />

	<BracketedSection className="relative z-10 w-screen h-screen">
		{@render children()}
	</BracketedSection>
</div>
