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
    import { attachFakeScroll, cancelFakeScrollMomentum } from '$lib/utils/fakeScroll';

    let _prevClick = 0;
    const TOTAL_CLICKS = 8;

    let contentEl: HTMLDivElement | undefined = $state();
    let viewportEl: HTMLDivElement | undefined = $state();

    $effect(() => {
        if (pageState.maxScrollY <= 0) return;
        const current = Math.round((pageState.scrollY / pageState.maxScrollY) * TOTAL_CLICKS);
        if (current === _prevClick) return;
        _prevClick = current;
        playTick();
    });

    $effect(() => {
        if (pageState.draggingDial) cancelFakeScrollMomentum();
    });

    $effect(() => {
        if (!viewportEl || !contentEl) return;
        return attachFakeScroll(viewportEl, contentEl);
    });

    $effect(() => attachAutoResume());
</script>

<Noise isFixed={true} />

<!-- Desktop sidebar -->
<div class="fixed top-0 left-0 hidden h-screen w-1/2 lg:block">
    <BracketedSection className="h-full max-w-140 ml-auto">
        <div class="h-full p-8">
            <Aside />
        </div>
    </BracketedSection>
</div>

<!-- Fake-scroll viewport -->
<div bind:this={viewportEl} class="fixed top-0 right-0 bottom-0 w-full overflow-hidden lg:w-1/2">
    <div
        bind:this={contentEl}
        class="container mr-auto will-change-transform lg:max-w-prose"
        style:transform="translate3d(0, {-pageState.scrollY}px, 0)"
    >
        <div class="relative bg-brand-bg p-8 pb-60 lg:ml-1 lg:min-h-screen lg:shadow-indent">
            <Noise />
            <!-- Mobile header -->
            <div class="pb-8 lg:hidden">
                <h1 class="text-4xl font-medium text-brand-text-highlight">milo vermeulen</h1>
                <p class="text-sm text-brand-text-accent">
                    μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो
                </p>
            </div>
            <About />
            <Experience />
            <Projects />
        </div>
    </div>
</div>

<!-- Mobile footer -->
<footer
    class="fixed -right-10 bottom-0 left-0 z-20 flex h-40 items-center justify-around gap-2 bg-brand-bg px-3 py-5 pr-10 shadow-raised lg:hidden"
>
    <Noise />
    <div class="aspect-square h-full rounded-full shadow-indent">
        <SectionDial />
    </div>
    <Contact />
    <div class="aspect-square h-full rounded-full shadow-indent">
        <ScrollDial />
    </div>
</footer>
