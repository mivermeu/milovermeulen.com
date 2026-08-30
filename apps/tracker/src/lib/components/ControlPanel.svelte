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
            <span class="text-xs text-brand-text">Orbits</span>
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
