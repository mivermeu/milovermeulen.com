<script lang="ts">
    import Rotator from '$lib/components/Rotator.svelte';
    import Contact from './Contact.svelte';
</script>

<aside class="flex h-full flex-col justify-between">
    <div class="mt-12">
        <h1 class="text-4xl font-medium text-brand-text-highlight">milo vermeulen</h1>
        <p class="text-sm text-brand-text-accent">μήλο / ميلو / ミロ / 밀로 / 美祿 / मिलो</p>
    </div>

    <Rotator />

    <Contact />

    <div class="text-xs text-brand-text-highlight/40">
        <p>© {new Date().getFullYear()} Milo Vermeulen</p>
    </div>
</aside>
