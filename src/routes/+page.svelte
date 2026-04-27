<script>
    import BracketedSection from '$lib/components/BracketedSection.svelte';
    import Noise from '$lib/components/Noise.svelte';
    import About from '$lib/sections/About.svelte';
    import Projects from '$lib/sections/Projects.svelte';
    import Experience from '$lib/sections/Experience.svelte';
    import Contact from '$lib/sections/Contact.svelte';
    import Aside from '$lib/sections/Aside.svelte';
    import Education from '$lib/sections/Education.svelte';
    import RaisedBorder from '$lib/components/RaisedBorder.svelte';
</script>

<div class="container mx-auto flex h-screen justify-center px-4 sm:px-6 lg:px-8">
    <BracketedSection className="w-1/3 h-screen">
        <RaisedBorder />
        <div class="h-full p-6 pl-12">
            <Aside />
        </div>
    </BracketedSection>

    <main class="z-10 max-w-prose overflow-y-auto bg-[#222]">
        <div class="relative p-8">
            <RaisedBorder />
            <Noise />
            <About />
            <Experience />
            <Education />
            <Projects />
            <Contact />
        </div>
    </main>
</div>
