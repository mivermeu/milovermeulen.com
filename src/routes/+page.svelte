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

    $effect(() => {
        const main = document.querySelector('main');
        if (main) {
            pageState.maxScrollY = main.scrollHeight - main.clientHeight;
        }
    });
</script>

<div
    class="container mx-auto flex h-screen flex-col overflow-clip px-0 lg:flex-row lg:justify-center xl:px-8"
>
    <Noise />

    <!-- Mobile header -->
    <div class="shrink-0 p-4 lg:hidden">
        <h1 class="text-4xl font-medium text-brand-text-highlight">milo vermeulen</h1>
        <p class="text-sm text-brand-text-accent">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
    </div>

    <BracketedSection className="hidden w-1/3 h-full lg:block">
        <div class="h-full p-8">
            <Aside />
        </div>
    </BracketedSection>

    <main
        class="z-10 min-h-0 flex-1 overflow-y-auto bg-brand-bg shadow-indent lg:max-w-prose"
        onscroll={(e) => {
            const target = e.currentTarget;
            pageState.scrollY = target.scrollTop;
            pageState.maxScrollY = target.scrollHeight - target.clientHeight;
        }}
    >
        <div class="relative p-8">
            <Noise />
            <About />
            <Experience />
            <Projects />
        </div>
    </main>

    <!-- Mobile footer -->
    <footer class="flex h-40 shrink-0 items-center justify-center gap-2 bg-brand-bg py-7 lg:hidden">
        <div class="aspect-square h-full rounded-full shadow-indent">
            <SectionDial />
        </div>
        <Contact />
        <div class="aspect-square h-full rounded-full shadow-indent">
            <ScrollDial />
        </div>
    </footer>
</div>
