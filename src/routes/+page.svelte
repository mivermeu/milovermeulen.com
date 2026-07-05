<script lang="ts">
    import BracketedSection from '$lib/components/BracketedSection.svelte';
    import Noise from '$lib/components/elements/Noise.svelte';
    import About from '$lib/sections/About.svelte';
    import Projects from '$lib/sections/Projects.svelte';
    import Experience from '$lib/sections/Experience.svelte';
    import Aside from '$lib/sections/Aside.svelte';
    import RaisedBorder from '$lib/components/elements/RaisedBorder.svelte';

    import { pageState } from '$lib/state/page.svelte';

    $effect(() => {
        const main = document.querySelector('main');
        if (main) {
            pageState.maxScrollY = main.scrollHeight - main.clientHeight;
        }
    });
</script>

<div class="container mx-auto flex h-screen justify-center px-4 xl:px-8">
    <Noise />
    <BracketedSection className="w-1/3 h-screen">
        <RaisedBorder />
        <div class="h-full p-8">
            <Aside />
        </div>
    </BracketedSection>

    <main
        class="z-10 h-screen max-w-prose overflow-y-auto bg-brand-bg"
        onscroll={(e) => {
            const target = e.currentTarget;
            pageState.scrollY = target.scrollTop;
            pageState.maxScrollY = target.scrollHeight - target.clientHeight;
        }}
    >
        <div class="relative p-8">
            <RaisedBorder />
            <Noise />
            <About />
            <Experience />
            <Projects />
        </div>
    </main>
</div>
