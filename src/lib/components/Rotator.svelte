<script lang="ts">
    import { pageState } from '$lib/state/page.svelte';
    import { onMount } from 'svelte';
    import Raised from './Raised.svelte';
    import Noise from './Noise.svelte';

    let fractions: Record<string, number> = {};

    onMount(() => {
        const sections = document.querySelectorAll('section');

        sections.forEach((section) => {
            const id = section.id;
            const rect = section.getBoundingClientRect();
            const viewportHeight = window.innerHeight;

            const fraction = Math.max(0, Math.min(1, rect.top / viewportHeight));

            if (pageState.scrollableSections.includes(id)) {
                fractions[id] = fraction;
            }
        });
    });

    const rotation = $derived(
        pageState.maxScrollY > 0 ? (pageState.scrollY / pageState.maxScrollY) * 180 : 0
    );
</script>

<Raised className="h-20 w-20 rounded-full bg-brand-bg relative">
    <div
        style:transform="rotate({rotation}deg)"
        class="flex h-full w-full items-start justify-center rounded-full"
    >
        <Noise className="rounded-full" />
        <div class="mt-1 h-1/3 w-0.5 bg-brand-text"></div>
    </div>
</Raised>
