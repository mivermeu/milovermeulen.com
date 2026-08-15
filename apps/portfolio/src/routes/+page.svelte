<script lang="ts">
    import BracketedSection from '$lib/components/BracketedSection.svelte';
    import Noise from '$lib/components/elements/Noise.svelte';
    import About from '$lib/sections/About.svelte';
    import Projects from '$lib/sections/Projects.svelte';
    import Experience from '$lib/sections/Experience.svelte';
    import Aside from '$lib/sections/Aside.svelte';
    import ScrollDial from '$lib/components/ScrollDial.svelte';
    import Contact from '$lib/components/Contact.svelte';

    import { pageState } from '$lib/state/page.svelte';
    import { playTick, attachAutoResume } from '$lib/audio/uiSound';

    let _prevClick = 0;
    const TOTAL_CLICKS = 8;

    let contentEl: HTMLDivElement | undefined = $state();

    function updateMaxScrollY() {
        pageState.maxScrollY = Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight
        );
    }

    $effect(() => {
        if (pageState.maxScrollY <= 0) return;
        const current = Math.round((pageState.scrollY / pageState.maxScrollY) * TOTAL_CLICKS);
        if (current === _prevClick) return;
        _prevClick = current;
        playTick();
    });

    // Drive native scroll from the dial while dragging (no body lock, so the
    // address bar stays put). touch-action:none + pointer capture keep the
    // browser from scrolling on its own during the drag.
    $effect(() => {
        if (pageState.draggingDial) {
            window.scrollTo(0, pageState.scrollY);
        }
    });

    $effect(() => {
        updateMaxScrollY();

        function onScroll() {
            if (!pageState.draggingDial) pageState.scrollY = window.scrollY;
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', updateMaxScrollY);

        let ro: ResizeObserver | undefined;
        if (contentEl) {
            ro = new ResizeObserver(updateMaxScrollY);
            ro.observe(contentEl);
        }

        const cleanup = attachAutoResume();

        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', updateMaxScrollY);
            ro?.disconnect();
            cleanup();
        };
    });
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

<!-- Content (scrolls natively via the document body) -->
<div bind:this={contentEl} class="lg:ml-[50%]">
    <div
        class="relative bg-brand-bg p-8 pb-30 lg:mr-auto lg:ml-1 lg:max-w-prose lg:min-h-screen lg:shadow-indent"
    >
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

<!-- Mobile footer -->
<footer
    class="fixed -right-10 bottom-0 left-0 z-20 flex h-40 items-center justify-between gap-4 bg-brand-bg py-5 pl-6 pr-16 shadow-raised lg:hidden"
>
    <Noise />
    <Contact />
    <div class="aspect-square h-full rounded-full shadow-indent">
        <ScrollDial />
    </div>
</footer>
