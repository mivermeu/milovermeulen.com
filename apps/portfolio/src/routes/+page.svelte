<script lang="ts">
    import BracketedSection from '$lib/components/BracketedSection.svelte';
    import Noise from '$lib/components/elements/Noise.svelte';
    import About from '$lib/sections/About.svelte';
    import Projects from '$lib/sections/Projects.svelte';
    import Experience from '$lib/sections/Experience.svelte';
    import Aside from '$lib/sections/Aside.svelte';
    import SectionDial from '$lib/components/SectionDial.svelte';
    import ScrollDial from '$lib/components/ScrollDial.svelte';
    import Contact from '$lib/components/Contact.svelte';

    import { pageState } from '$lib/state/page.svelte';
    import { playTick, attachAutoResume } from '$lib/audio/uiSound';

    let _prevClick = 0;
    const TOTAL_CLICKS = 8;

    function tick() {
        if (pageState.maxScrollY <= 0) return;
        const current = Math.round((pageState.scrollY / pageState.maxScrollY) * TOTAL_CLICKS);
        if (current === _prevClick) return;
        _prevClick = current;
        playTick();
    }

    function handleScroll() {
        pageState.scrollY = window.scrollY;
        pageState.maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
        tick();
    }

    $effect(() => {
        pageState.maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
        return attachAutoResume();
    });
</script>

<svelte:window onscroll={handleScroll} />

<Noise isFixed={true} />

<!-- Desktop sidebar -->
<div class="fixed top-0 left-0 z-20 hidden h-screen w-1/3 lg:block">
    <BracketedSection className="h-full w-full">
        <div class="h-full p-8">
            <Aside />
        </div>
    </BracketedSection>
</div>

<!-- Mobile header -->
<header class="fixed top-0 right-0 left-0 z-20 bg-brand-bg p-4 lg:hidden">
    <h1 class="text-4xl font-medium text-brand-text-highlight">milo vermeulen</h1>
    <p class="text-sm text-brand-text-accent">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
</header>

<!-- Scrollable content -->
<main class="container mx-auto pt-30 pb-40 lg:ml-[33.333%] lg:max-w-prose lg:pt-0 lg:pb-8">
    <div class="relative bg-brand-bg p-8 pb-30 shadow-indent lg:min-h-screen">
        <Noise />
        <About />
        <Experience />
        <Projects />
    </div>
</main>

<!-- Mobile footer -->
<footer
    class="fixed right-0 bottom-0 left-0 z-20 flex h-40 items-center justify-center gap-2 bg-brand-bg px-3 py-5 lg:hidden"
>
    <div class="aspect-square h-full rounded-full shadow-indent">
        <SectionDial />
    </div>
    <Contact />
    <div class="aspect-square h-full rounded-full shadow-indent">
        <ScrollDial />
    </div>
</footer>
