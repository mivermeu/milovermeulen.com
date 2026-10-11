<script lang="ts">
    import { trackerState } from '$lib/state.svelte';
    import Panel from './Panel.svelte';

    let now = $state(new Date());

    $effect(() => {
        const id = setInterval(() => (now = new Date()), 1000);
        return () => clearInterval(id);
    });

    const utcString = $derived(now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
</script>

<Panel title="Controls">
    <div class="space-y-3">
        <label class="flex cursor-pointer items-center gap-2">
            <input
                type="checkbox"
                bind:checked={trackerState.showOrbits}
                class="h-3 w-3 accent-brand-primary"
            />
            <span class="text-xs text-brand-text">All orbits</span>
        </label>

        <label class="flex cursor-pointer items-center gap-2">
            <input
                type="checkbox"
                bind:checked={trackerState.showEquatorial}
                class="h-3 w-3 accent-brand-primary"
            />
            <span class="text-xs text-brand-text">Equatorial plane</span>
        </label>

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
            <div class="mb-1 flex items-center gap-1">
                <p class="text-[10px] text-brand-text">Elements</p>
                <span class="group relative inline-flex">
                    <button
                        type="button"
                        aria-label="About element sets"
                        class="flex h-4 w-4 items-center justify-center rounded-full border border-brand-text/30 p-0 text-[9px] font-semibold text-brand-text/60 hover:border-brand-text/60 hover:bg-transparent hover:text-brand-text"
                        >i</button
                    >
                    <span
                        role="tooltip"
                        class="pointer-events-none absolute top-4 left-0 z-50 hidden w-56 rounded border border-brand-secondary bg-brand-bg/95 p-2 text-[10px] leading-snug text-brand-text shadow-lg group-focus-within:block group-hover:block"
                        >Epoch: the TLE's published elements, frozen at its reference time.
                        Smoothed: the mean orbit advanced to now — live and smooth. Instantaneous:
                        the exact tangent ellipse right now; precise, but its periapsis angle is
                        noisy for near-circular orbits.</span
                    >
                </span>
            </div>
            <div class="flex gap-1">
                <button
                    type="button"
                    class="speed-btn"
                    class:active={trackerState.elementMode === 'epoch'}
                    aria-pressed={trackerState.elementMode === 'epoch'}
                    onclick={() => (trackerState.elementMode = 'epoch')}
                >
                    Epoch
                </button>
                <button
                    type="button"
                    class="speed-btn"
                    class:active={trackerState.elementMode === 'smoothed'}
                    aria-pressed={trackerState.elementMode === 'smoothed'}
                    onclick={() => (trackerState.elementMode = 'smoothed')}
                >
                    Smoothed
                </button>
                <button
                    type="button"
                    class="speed-btn"
                    class:active={trackerState.elementMode === 'instantaneous'}
                    aria-pressed={trackerState.elementMode === 'instantaneous'}
                    onclick={() => (trackerState.elementMode = 'instantaneous')}
                >
                    Instant
                </button>
            </div>
        </div>

        <div>
            <p class="mb-1 text-[10px] text-brand-text">Time</p>
            <p class="font-mono text-[10px] text-brand-text-highlight">
                {utcString}
            </p>
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
