<script lang="ts">
    import SectionDial from '$lib/components/SectionDial.svelte';
    import ScrollDial from '$lib/components/ScrollDial.svelte';
    import Contact from '$lib/components/Contact.svelte';
</script>

<aside class="flex h-full flex-col justify-start gap-10">
    <div class="my-12">
        <h1 class="text-4xl font-medium text-brand-text-highlight">milo vermeulen</h1>
        <p class="text-sm text-brand-text-accent">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
    </div>

    <div class="flex w-full flex-row items-center gap-3 xl:flex-row xl:gap-10">
        <SectionDial class="max-w-40" />
        <ScrollDial class="max-w-40" />
    </div>
    <Contact />

    <div class="mt-auto text-xs text-brand-text-highlight/40">
        <p>© {new Date().getFullYear()} Milo Vermeulen</p>
    </div>
</aside>
