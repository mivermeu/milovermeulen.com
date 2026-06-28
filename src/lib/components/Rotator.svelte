<script lang="ts">
    import { pageState } from '$lib/state/page.svelte';
    import Raised from './Raised.svelte';
    import Noise from './Noise.svelte';

    const startAngle = 45;
    const angleRange = 90;

    const fractionToRotation = (fraction: number): number => {
        const fractionAngle = startAngle + fraction * angleRange;
        return Math.min(startAngle + angleRange, Math.max(startAngle, fractionAngle));
    };

    let fractions: Record<string, number> = $state({});

    $effect(() => {
        const totalScroll = pageState.maxScrollY;
        if (totalScroll === 0) return;

        const sections = document.querySelectorAll('section');
        sections.forEach((section) => {
            const id = section.id;
            if (!pageState.scrollableSections.includes(id)) return;

            const scrollMargin = parseFloat(getComputedStyle(section).scrollMarginTop);
            const effectiveTop = section.offsetTop - scrollMargin;

            fractions[id] = id === pageState.scrollableSections[0] ? 0 : effectiveTop / totalScroll;
        });
    });

    const dialRotation = $derived(
        pageState.maxScrollY > 0
            ? fractionToRotation(pageState.scrollY / pageState.maxScrollY)
            : startAngle
    );
</script>

<div class="h-40 w-40 rounded-full p-0.5 shadow-indent">
    <Raised className="h-full w-full rounded-full bg-brand-bg relative overflow-visible">
        <!-- Dial -->
        <div
            style:transform="rotate({dialRotation}deg)"
            class="flex h-full w-full items-start justify-center rounded-full"
        >
            <Noise className="rounded-full" />
            <div class="absolute mt-2 h-5 w-0.5 bg-brand-text"></div>
            <div class="absolute bottom-0 mb-2 h-5 w-0.5 bg-brand-text"></div>
            <p class="m-auto" style:transform="rotate(-90deg)">section</p>
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
</div>
