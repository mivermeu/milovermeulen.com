<script>
    import BracketedSection from '$lib/components/BracketedSection.svelte';
    import Noise from '$lib/components/Noise.svelte';
    import About from '$lib/sections/About.svelte';
    import Projects from '$lib/sections/Projects.svelte';
    import Experience from '$lib/sections/Experience.svelte';
    import Aside from '$lib/sections/Aside.svelte';
    import RaisedBorder from '$lib/components/RaisedBorder.svelte';
</script>

<div class="container mx-auto flex h-screen justify-center px-4 sm:px-6 lg:px-8">
    <Noise />
    <BracketedSection className="w-1/3 h-screen">
        <RaisedBorder />
        <div class="h-full p-8">
            <Aside />
        </div>
    </BracketedSection>

    <main class="no-scrollbar z-10 max-w-prose overflow-y-auto scroll-smooth bg-brand-bg">
        <div class="relative p-8">
            <RaisedBorder />
            <Noise />
            <About />
            <Experience />
            <Projects />
        </div>
    </main>
</div>
