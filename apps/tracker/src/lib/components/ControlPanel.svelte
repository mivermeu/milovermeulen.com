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

{#snippet optionButton(label: string, tip: string, active: boolean, onclick: () => void)}
    <span class="group relative inline-flex">
        <button type="button" class="speed-btn" class:active aria-pressed={active} {onclick}>
            {label}
        </button>
        <span
            role="tooltip"
            class="pointer-events-none absolute top-full left-0 z-50 mt-1 hidden w-44 rounded border border-brand-secondary bg-brand-bg/95 p-2 text-[10px] leading-snug text-brand-text shadow-lg group-focus-within:block group-hover:block"
            >{tip}</span
        >
    </span>
{/snippet}

<Panel title="Controls">
    {#snippet actions()}
        <button
            type="button"
            id="panels-close"
            aria-label="Hide panels"
            onclick={() => (trackerState.panelsOpen = false)}
            class="flex h-6 w-6 items-center justify-center rounded border border-brand-secondary bg-brand-secondary/85 p-0 text-brand-text hover:bg-white/10 md:hidden"
        >
            <svg viewBox="0 0 12 12" class="h-3 w-3" aria-hidden="true">
                <path
                    d="M2 2 10 10M10 2 2 10"
                    stroke="currentColor"
                    stroke-width="1.6"
                    fill="none"
                />
            </svg>
        </button>
    {/snippet}
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
                bind:checked={trackerState.showGroundTrack}
                class="h-3 w-3 accent-brand-primary"
            />
            <span class="text-xs text-brand-text">Ground track</span>
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
                {@render optionButton(
                    'ECF',
                    'Earth-fixed: rotates with the Earth, so it shows where satellites sit over the ground.',
                    trackerState.referenceFrame === 'ecf',
                    () => (trackerState.referenceFrame = 'ecf')
                )}
                {@render optionButton(
                    'ECI',
                    'Inertial: fixed against the stars, so it shows the orbit shape without the Earth spinning under it.',
                    trackerState.referenceFrame === 'eci',
                    () => (trackerState.referenceFrame = 'eci')
                )}
            </div>
        </div>

        <div>
            <p class="mb-1 text-[10px] text-brand-text">Elements</p>
            <div class="flex gap-1">
                {@render optionButton(
                    'Epoch',
                    "The TLE's published elements, frozen at its reference time.",
                    trackerState.elementMode === 'epoch',
                    () => (trackerState.elementMode = 'epoch')
                )}
                {@render optionButton(
                    'Smoothed',
                    'The mean orbit advanced to now — live and smooth.',
                    trackerState.elementMode === 'smoothed',
                    () => (trackerState.elementMode = 'smoothed')
                )}
                {@render optionButton(
                    'Instant',
                    'The exact tangent ellipse right now; its periapsis angle oscillates each orbit.',
                    trackerState.elementMode === 'instantaneous',
                    () => (trackerState.elementMode = 'instantaneous')
                )}
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
    /* Unlayered component styles win the cascade; grow tap targets on touch. */
    @media (pointer: coarse) {
        .speed-btn {
            font-size: 0.75rem;
            padding: 0.25rem 0.5rem;
        }
    }
</style>
