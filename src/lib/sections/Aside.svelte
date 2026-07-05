<script lang="ts">
    import SectionDial from '$lib/components/SectionDial.svelte';
    import Contact from '$lib/components/Contact.svelte';
</script>

<aside class="flex h-full flex-col justify-start gap-20">
    <div class="mt-12">
        <h1 class="text-4xl font-medium text-brand-text-highlight">milo vermeulen</h1>
        <p class="text-sm text-brand-text-accent">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
    </div>

    <Contact />
    <SectionDial />

    <div class="mt-auto text-xs text-brand-text-highlight/40">
        <p>© {new Date().getFullYear()} Milo Vermeulen</p>
    </div>
</aside>
