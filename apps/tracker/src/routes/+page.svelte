<script lang="ts">
    import { resolve } from '$app/paths';
    import ControlPanel from '$lib/components/ControlPanel.svelte';
    import FilterPanel from '$lib/components/FilterPanel.svelte';
    import SatelliteInfo from '$lib/components/SatelliteInfo.svelte';
    import SatelliteViewer from '$lib/components/SatelliteViewer.svelte';
    import favicon from '$lib/assets/favicon.svg';
    import { sourceLabel } from '$lib/utils';
    import { trackerState } from '$lib/state.svelte';

    let panelsOpen = $state(
        typeof matchMedia !== 'undefined' && matchMedia('(min-width: 768px)').matches
    );
</script>

<svelte:head>
    <title>Satellite Tracker</title>
</svelte:head>

<div class="flex h-screen w-screen flex-col bg-brand-bg text-brand-text">
    <header
        class="flex items-center justify-between border-b border-brand-secondary bg-brand-bg px-4 py-2"
    >
        <h1 class="text-lg font-semibold text-brand-text-highlight">Satellite Tracker</h1>
        <div class="flex items-center gap-3">
            <span class="text-xs text-brand-text">{sourceLabel(trackerState.dataSource)}</span>
            <a
                href={resolve('/')}
                aria-label="Portfolio"
                class="inline-flex items-center justify-center overflow-hidden rounded-lg border border-brand-primary bg-transparent p-1 transition-colors duration-150 hover:bg-white/15 active:scale-[0.97]"
            >
                <img src={favicon} alt="Portfolio" class="h-5 w-5" />
            </a>
        </div>
    </header>

    <div class="relative h-full w-full flex-1 overflow-hidden">
        <SatelliteViewer />
        <div class="pointer-events-none absolute inset-0 z-10">
            <SatelliteInfo />
        </div>
        <div
            class="pointer-events-none absolute top-3 right-3 bottom-3 z-20 flex w-80 flex-col gap-3 transition-transform duration-300"
            class:translate-x-[calc(100%+0.75rem)]={!panelsOpen}
        >
            <div class="shrink-0">
                <ControlPanel />
            </div>
            <div class="flex min-h-0 flex-col">
                <FilterPanel />
            </div>
        </div>
        <button
            type="button"
            class="pointer-events-auto absolute top-3 z-30 flex aspect-square h-8 cursor-pointer items-center justify-center rounded-lg border border-brand-secondary bg-brand-secondary/85 p-1 shadow-lg backdrop-blur-sm transition-all duration-300 hover:bg-white/15"
            style:right={panelsOpen ? 'calc(20rem + 1.5rem)' : '0.75rem'}
            onclick={() => (panelsOpen = !panelsOpen)}
            aria-label={panelsOpen ? 'Minimize panels' : 'Show panels'}
        >
            <svg
                class="h-full w-full text-brand-text transition-transform duration-300"
                class:rotate-180={!panelsOpen}
                viewBox="0 0 20 20"
                fill="currentColor"
            >
                <path
                    fill-rule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clip-rule="evenodd"
                />
            </svg>
        </button>
    </div>
</div>
