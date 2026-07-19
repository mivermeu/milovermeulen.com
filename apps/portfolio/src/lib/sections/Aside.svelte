<script lang="ts">
    import SectionDial from '$lib/components/SectionDial.svelte';
    import ScrollDial from '$lib/components/ScrollDial.svelte';
    import Contact from '$lib/components/Contact.svelte';

    const dialStyle =
        'max-w[clamp(5rem,18vh,10rem)] aspect-square w-full rounded-full shadow-indent';
</script>

<aside class="flex h-full flex-col justify-start gap-[clamp(0.5rem,3vh,2.5rem)]">
    <div class="my-[clamp(0.5rem,5vh,3rem)]">
        <h1 class="text-4xl font-medium text-brand-text-highlight">milo vermeulen</h1>
        <p class="text-sm text-brand-text-accent">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
    </div>

    <div class="flex h-full flex-col items-center gap-[clamp(0.5rem,100rem,4rem)]">
        <div class="flex w-full flex-row items-center gap-[clamp(0.25rem,2vh,2.5rem)]">
            <div class={dialStyle}>
                <SectionDial />
            </div>
            <div class={dialStyle}>
                <ScrollDial />
            </div>
        </div>
        <Contact />
    </div>

    <div class="mt-auto text-xs text-brand-text-highlight/40">
        <p>© {new Date().getFullYear()} Milo Vermeulen</p>
    </div>
</aside>
