<script lang="ts">
    import { pageState } from '$lib/state/page.svelte';
    import Raised from './Raised.svelte';
    import Noise from './Noise.svelte';
    import Icon from './Icon.svelte';
    import type { icons } from '$lib/data/icons';

    const startAngle = 0;
    const angleRange = 90;
    const sweepStart = 135;

    const sectionIcons: Record<string, keyof typeof icons> = {
        about: 'user',
        experience: 'suitcase',
        projects: 'lightbulb'
    };

    const outerTickStyle =
        'absolute top-0 left-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-6 bg-brand-text';
    const innerTickStyle = 'absolute top-0 left-1/2 mt-2 h-3 w-0.5 -translate-x-1/2 bg-brand-text';

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

    let dragging = $state(false);
    let prevRawAngle = $state(0);
    let dialElement: HTMLDivElement | undefined = $state();

    function getAngleRad(clientX: number, clientY: number): number {
        if (!dialElement) return 0;
        const rect = dialElement.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.atan2(clientX - cx, -(clientY - cy));
    }

    function currentDialAngle(): number {
        return pageState.maxScrollY > 0
            ? fractionToRotation(pageState.scrollY / pageState.maxScrollY)
            : startAngle;
    }

    function setScrollFromDialAngle(dialAngle: number): void {
        const fraction = (dialAngle - startAngle) / angleRange;
        const scrollY = Math.round(fraction * pageState.maxScrollY);
        const main = document.querySelector('main');
        if (main) main.scrollTop = scrollY;
        pageState.scrollY = scrollY;
    }

    function onPointerDown(e: PointerEvent): void {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragging = true;
        prevRawAngle = getAngleRad(e.clientX, e.clientY);
    }

    function onPointerMove(e: PointerEvent): void {
        if (!dragging) return;
        const raw = getAngleRad(e.clientX, e.clientY);
        let delta = raw - prevRawAngle;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        prevRawAngle = raw;

        const newAngle = Math.max(
            startAngle,
            Math.min(startAngle + angleRange, currentDialAngle() + (delta * 180) / Math.PI)
        );
        setScrollFromDialAngle(newAngle);
    }

    function onPointerUp(): void {
        dragging = false;
    }
</script>

<div
    class="aspect-square w-full rounded-full shadow-indent select-none {dragging
        ? 'cursor-grabbing'
        : 'cursor-grab'}"
    bind:this={dialElement}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    role="slider"
    aria-label="Scroll position"
    aria-valuemin="0"
    aria-valuemax={pageState.maxScrollY}
    aria-valuenow={pageState.scrollY}
    tabindex="0"
>
    <Raised
        className="h-[calc(100%-0.5rem)] aspect-square m-1 rounded-full bg-brand-bg relative overflow-visible"
    >
        <!-- Dial -->
        <div style:transform="rotate({dialRotation}deg)" class="h-full w-full rounded-full">
            <Noise className="rounded-full" />
            <div class="h-full w-full" style="transform: rotate({sweepStart}deg)">
                <div class={innerTickStyle}></div>
            </div>
            <!-- Indicator ticks -->
            {#each Object.entries(fractions) as [id, fraction] (id)}
                <div
                    class="absolute top-0 left-0 h-full w-full"
                    style:transform="rotate(-{fractionToRotation(fraction)}deg)"
                >
                    <div class={innerTickStyle}></div>
                    <Icon
                        icon_name={sectionIcons[id]}
                        class="absolute top-7 left-1/2 z-10 h-7 w-7 origin-center -translate-x-1/2 fill-brand-text stroke-brand-text"
                    />
                </div>
            {/each}
        </div>
        <!-- Top tick -->
        <div class={outerTickStyle}></div>
        <!-- Total range indicator (only works for angleRange=90) -->
        {#each [startAngle + sweepStart, startAngle + angleRange + sweepStart] as angle (angle)}
            <div class="absolute top-0 left-0 h-full w-full" style:transform="rotate({angle}deg)">
                <div class={outerTickStyle}></div>
            </div>
        {/each}
        <div
            class="absolute top-1/2 left-1/2 h-[calc(100%+3rem)] w-[calc(100%+3rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-text [clip-path:polygon(50%_0%,100%_0%,100%_50%,50%_50%)]"
            style:transform="rotate({startAngle + sweepStart}deg)"
        ></div>
    </Raised>
</div>
