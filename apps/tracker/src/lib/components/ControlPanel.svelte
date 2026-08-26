<script lang="ts">
    import { SPEED_OPTIONS, sourceLabel, trackerState } from '$lib/state.svelte';
</script>

<div
    class="pointer-events-auto w-64 rounded-lg border border-brand-secondary bg-brand-secondary/85 p-4 shadow-lg backdrop-blur-sm"
>
    <h3>Tracker controls</h3>

    <label class="mb-4 flex cursor-pointer items-center justify-between">
        <span class="text-brand-text">Show orbits</span>
        <input type="checkbox" bind:checked={trackerState.showOrbits} class="h-4 w-4 accent-brand-primary" />
    </label>

    <div class="mb-4">
        <p class="mb-2 text-brand-text">Speed</p>
        <div class="flex flex-wrap gap-1.5">
            {#each SPEED_OPTIONS as option (option.value)}
                <button
                    type="button"
                    class="speed-btn"
                    class:active={trackerState.speed === option.value}
                    aria-pressed={trackerState.speed === option.value}
                    onclick={() => (trackerState.speed = option.value)}
                >
                    {option.label}
                </button>
            {/each}
        </div>
    </div>

    <dl class="space-y-1 text-xs">
        <div class="flex justify-between">
            <dt class="text-brand-text">Satellites</dt>
            <dd class="text-brand-text-highlight">{trackerState.renderedCount}</dd>
        </div>
        <div class="flex justify-between gap-2">
            <dt class="text-brand-text">Data source</dt>
            <dd class="text-right text-brand-text-highlight">{sourceLabel(trackerState.dataSource)}</dd>
        </div>
    </dl>

    {#if trackerState.error}
        <p class="mt-3 border-t border-brand-secondary pt-2 text-xs text-brand-accent">{trackerState.error}</p>
    {/if}
</div>

<style>
    button.speed-btn.active {
        border-color: var(--color-brand-text-highlight);
        background-color: rgba(255, 255, 255, 0.2);
        color: var(--color-brand-text-highlight);
    }
</style>