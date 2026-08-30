<script lang="ts">
    import { resolve } from '$app/paths';
    import ControlPanel from '$lib/components/ControlPanel.svelte';
    import FilterPanel from '$lib/components/FilterPanel.svelte';
    import SatelliteInfo from '$lib/components/SatelliteInfo.svelte';
    import SatelliteViewer from '$lib/components/SatelliteViewer.svelte';
    import favicon from '$lib/assets/favicon.svg';
    import { sourceLabel } from '$lib/utils';
    import { trackerState } from '$lib/state.svelte';
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
        <div class="pointer-events-none absolute top-3 right-3 bottom-3 z-20 flex flex-col gap-3">
            <div class="shrink-0">
                <ControlPanel />
            </div>
            <div class="flex min-h-0 flex-col">
                <FilterPanel />
            </div>
        </div>
    </div>
</div>
