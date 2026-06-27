<script lang="ts">
    import { pageState } from '$lib/state/page.svelte';
    import { onMount } from 'svelte';
    import Raised from './Raised.svelte';
    import Noise from './Noise.svelte';

    const fractionToRotation = (fraction: number): number => {
        return 45 + fraction * 90;
    };

    let fractions: Record<string, number> = $state({});

    onMount(() => {
        const sections = document.querySelectorAll('section');

        sections.forEach((section) => {
            const id = section.id;
            const rect = section.getBoundingClientRect();
            const viewportHeight = window.innerHeight;

            const fraction = Math.max(0, Math.min(1, rect.top / viewportHeight));

            if (pageState.scrollableSections.includes(id)) {
                fractions[id] = fraction < 0.2 ? 0 : fraction;
            }
        });
    });

    const rotation = $derived(
        pageState.maxScrollY > 0 ? fractionToRotation(pageState.scrollY / pageState.maxScrollY) : 0
    );
</script>

<Raised className="h-20 w-20 rounded-full bg-brand-bg relative overflow-visible">
    <!-- Dial -->
    <div
        style:transform="rotate({rotation}deg)"
        class="flex h-full w-full items-start justify-center rounded-full"
    >
        <Noise className="rounded-full" />
        <div class="mt-2 h-5 w-0.5 bg-brand-text"></div>
    </div>
    <!-- Indicator ticks -->
    {#each Object.entries(fractions) as [id, fraction] (id)}
        <div
            class="absolute top-0 left-0 h-full w-full"
            style:transform="rotate({fractionToRotation(fraction)}deg)"
        >
            <div
                class="absolute top-0 left-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-5 bg-brand-text"
            ></div>
            <a
                class="absolute -top-7 left-1/2 origin-left -translate-y-3"
                style:transform="rotate(-{fractionToRotation(fraction)}deg)"
                href={`#${id}`}
                aria-label={id}
            >
                {id}
            </a>
        </div>
    {/each}
</Raised>
