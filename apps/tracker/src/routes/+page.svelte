<script lang="ts">
    import ControlPanel from '$lib/components/ControlPanel.svelte';
    import FilterPanel from '$lib/components/FilterPanel.svelte';
    import PassesPanel from '$lib/components/PassesPanel.svelte';
    import SatelliteGraph from '$lib/components/SatelliteGraph.svelte';
    import SatelliteInfo from '$lib/components/SatelliteInfo.svelte';
    import SatelliteViewer from '$lib/components/SatelliteViewer.svelte';
    import favicon from '$lib/assets/favicon.svg';
    import { sourceLabel } from '$lib/utils';
    import { trackerState } from '$lib/state.svelte';
    import { initTrackerUrlSync } from '$lib/url-sync.svelte';

    $effect(() => initTrackerUrlSync());

    let isMobile = $state(false);

    $effect(() => {
        const mq = matchMedia('(max-width: 767px)');
        const update = () => (isMobile = mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    });

    let drawerOpen = $state({ filters: true, controls: true, passes: true });

    let wasOpen = false;

    // Mobile modal focus: land on the toggle on open (deferred past the transition, no scroll), return on close.
    $effect(() => {
        if (typeof document === 'undefined') return;
        if (trackerState.panelsOpen && isMobile && !wasOpen) {
            const timer = setTimeout(() => {
                document.getElementById('panels-toggle')?.focus({ preventScroll: true });
            }, 350);
            return () => clearTimeout(timer);
        }
        if (wasOpen && !trackerState.panelsOpen && document.activeElement === document.body) {
            document.getElementById('panels-toggle')?.focus();
        }
        wasOpen = trackerState.panelsOpen;
    });

    function onKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Escape' || !trackerState.panelsOpen) return;
        if (document.querySelector('[role="dialog"]')) return;
        const target = event.target as HTMLElement | null;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        trackerState.panelsOpen = false;
    }
</script>

<svelte:head>
    <title>Satellite Tracker</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="app-shell flex h-dvh w-full flex-col bg-brand-bg text-brand-text">
    <header
        class="flex items-center justify-between border-b border-brand-secondary bg-brand-bg px-3 py-1.5 md:px-4 md:py-2"
    >
        <h1 class="text-lg font-semibold text-brand-text-highlight">Satellite Tracker</h1>
        <div class="flex items-center gap-3">
            <span class="text-xs text-brand-text"
                >{sourceLabel(trackerState.dataSource)}{trackerState.staleHidden > 0
                    ? ` · ${trackerState.staleHidden} stale hidden`
                    : ''}</span
            >
            <!-- eslint-disable svelte/no-navigation-without-resolve -->
            <a
                href="/"
                aria-label="Portfolio"
                class="inline-flex items-center justify-center overflow-hidden rounded-lg border border-brand-primary bg-transparent p-1 transition-colors duration-150 hover:bg-white/15 active:scale-[0.97]"
            >
                <img src={favicon} alt="Portfolio" class="h-5 w-5" />
            </a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
        </div>
    </header>

    <div class="relative h-full w-full flex-1 overflow-hidden">
        <SatelliteViewer />
        <div class="pointer-events-none absolute inset-0 z-10">
            <SatelliteInfo />
        </div>
        <SatelliteGraph />
        {#if trackerState.panelsOpen}
            <button
                type="button"
                aria-label="Hide panels"
                onclick={() => (trackerState.panelsOpen = false)}
                class="pointer-events-auto absolute inset-0 z-10 rounded-none border-0 bg-black/50 p-0 md:hidden"
            ></button>
        {/if}

        <button
            type="button"
            id="panels-toggle"
            aria-label={trackerState.panelsOpen ? 'Hide panels' : 'Show panels'}
            onclick={() => (trackerState.panelsOpen = !trackerState.panelsOpen)}
            class="pointer-events-auto absolute top-1.5 right-1.5 z-30 flex aspect-square h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-brand-secondary bg-brand-secondary/85 p-1 text-brand-text shadow-lg outline-hidden backdrop-blur-sm transition-all duration-300 hover:bg-white/15 focus-visible:bg-white/15 md:top-3 {trackerState.panelsOpen
                ? 'md:right-[calc(20rem+0.75rem)]'
                : 'md:right-3'}"
        >
            <svg
                class="h-full w-full transition-transform duration-300 {trackerState.panelsOpen
                    ? ''
                    : 'rotate-180'}"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
            >
                <path
                    fill-rule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clip-rule="evenodd"
                />
            </svg>
        </button>

        <div
            inert={!trackerState.panelsOpen}
            class="absolute top-0 right-0 bottom-0 z-20 flex w-80 flex-col border-l border-brand-secondary bg-brand-bg transition-transform duration-300 max-md:overflow-y-auto {trackerState.panelsOpen
                ? 'translate-x-0'
                : 'translate-x-full'}"
        >
            <div
                class="flex min-h-0 flex-1 flex-col divide-y divide-brand-secondary md:overflow-hidden"
            >
                <div class="shrink-0">
                    <ControlPanel
                        open={drawerOpen.controls}
                        onToggle={() => (drawerOpen.controls = !drawerOpen.controls)}
                    />
                </div>
                <div class="flex min-h-0 shrink-0 flex-col {drawerOpen.filters ? 'md:flex-1' : ''}">
                    <FilterPanel
                        open={drawerOpen.filters}
                        onToggle={() => (drawerOpen.filters = !drawerOpen.filters)}
                    />
                </div>
                <div class="flex min-h-0 shrink-0 flex-col {drawerOpen.passes ? 'md:flex-1' : ''}">
                    <PassesPanel
                        open={drawerOpen.passes}
                        onToggle={() => (drawerOpen.passes = !drawerOpen.passes)}
                    />
                </div>
            </div>
        </div>
    </div>
</div>
