<script lang="ts">
    import { SPEED_OPTIONS, trackerState } from '$lib/state.svelte';
    import Panel from './Panel.svelte';

    const SCRUB_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
</script>

<Panel title="Controls">
    <div class="space-y-3">
        <label class="flex cursor-pointer items-center justify-between">
            <span class="text-xs text-brand-text">Orbits</span>
            <input
                type="checkbox"
                bind:checked={trackerState.showOrbits}
                class="h-3 w-3 accent-brand-primary"
            />
        </label>

        <div>
            <p class="mb-1 text-[10px] text-brand-text">Speed</p>
            <div class="flex flex-wrap gap-1">
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

        <div>
            <p class="mb-1 text-[10px] text-brand-text">Frame</p>
            <div class="flex gap-1">
                <button
                    type="button"
                    class="speed-btn"
                    class:active={trackerState.referenceFrame === 'ecf'}
                    aria-pressed={trackerState.referenceFrame === 'ecf'}
                    onclick={() => (trackerState.referenceFrame = 'ecf')}
                >
                    ECF
                </button>
                <button
                    type="button"
                    class="speed-btn"
                    class:active={trackerState.referenceFrame === 'eci'}
                    aria-pressed={trackerState.referenceFrame === 'eci'}
                    onclick={() => (trackerState.referenceFrame = 'eci')}
                >
                    ECI
                </button>
            </div>
        </div>

        <div>
            <p class="mb-1 text-[10px] text-brand-text">Time</p>
            <p class="mb-1 font-mono text-[10px] text-brand-text-highlight">
                {trackerState.simDateTime || '—'}
            </p>
            <input
                type="range"
                min={now - SCRUB_RANGE_MS}
                max={now + SCRUB_RANGE_MS}
                step={60000}
                value={now}
                oninput={(e) => {
                    trackerState.setSimTime?.(Number(e.currentTarget.value));
                    trackerState.speed = 0;
                }}
                class="w-full accent-brand-primary"
            />
        </div>
    </div>
</Panel>

<style>
    button.speed-btn {
        border: 1px solid var(--color-brand-secondary);
        border-radius: 0.25rem;
        padding: 0.125rem 0.375rem;
        font-size: 0.625rem;
        color: var(--color-brand-text);
        background: transparent;
        cursor: pointer;
        transition: all 0.15s;
    }
    button.speed-btn:hover {
        border-color: var(--color-brand-text-highlight);
        background: rgba(255, 255, 255, 0.1);
    }
    button.speed-btn.active {
        border-color: var(--color-brand-text-highlight);
        background-color: rgba(255, 255, 255, 0.2);
        color: var(--color-brand-text-highlight);
    }
</style>
