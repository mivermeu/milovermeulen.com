<script lang="ts">
    import { resolve } from '$app/paths';
    import ControlPanel from '$lib/components/ControlPanel.svelte';
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
        class="flex items-center justify-between border-b border-brand-secondary bg-brand-bg px-4 py-3"
    >
        <h1 class="text-xl font-semibold text-brand-text-highlight">Satellite Tracker</h1>
        <div class="flex items-center gap-3">
            <span class="text-xs text-brand-text">{sourceLabel(trackerState.dataSource)}</span>
            <a
                href={resolve('/')}
                aria-label="Portfolio"
                class="inline-flex items-center justify-center overflow-hidden rounded-lg border border-brand-primary bg-transparent p-1.5 transition-colors duration-150 hover:bg-white/15 active:scale-[0.97]"
            >
                <img src={favicon} alt="Portfolio" class="h-6 w-6" />
            </a>
        </div>
    </header>

    <div class="relative flex-1 overflow-hidden">
        <SatelliteViewer />
        <div class="pointer-events-none absolute inset-0 z-10">
            <SatelliteInfo />
        </div>
        <div class="pointer-events-none absolute top-4 right-4 z-20 max-h-full overflow-y-auto">
            <ControlPanel />
        </div>
    </div>
</div>
