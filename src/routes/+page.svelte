<script>
    import BracketedSection from "$lib/components/BracketedSection.svelte";
    import Noise from "$lib/components/Noise.svelte";
	import About from "$lib/sections/About.svelte";
	import Projects from "$lib/sections/Projects.svelte";
	import Experience from "$lib/sections/Experience.svelte";
	import Contact from "$lib/sections/Contact.svelte";
	import Aside from "$lib/sections/Aside.svelte";
	import Education from "$lib/sections/Education.svelte";
</script>
<div class="flex h-screen w-screen">
    <BracketedSection className="w-1/3 h-screen border-r-3 border-black">
        <div class="absolute inset-0 pointer-events-none z-20 shadow-[inset_-4px_0_1px_rgba(255,255,255,0.8)]"></div>
        <div class="absolute inset-0 pointer-events-none z-20 shadow-[inset_-3px_0_1px_rgba(0,0,0,0.8)]"></div>
        <Noise />
        <div class="p-6 pl-12 h-full">
            <Aside />
        </div>
    </BracketedSection>

    <main class="w-2/3 overflow-y-auto">
        <div class="relative p-8">
            <Noise />
            <About />
            <Experience />
            <Education />
            <Projects />
            <Contact />
        </div>
    </main>
</div>
