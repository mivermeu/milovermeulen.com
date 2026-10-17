<script lang="ts">
    let { open = true, onToggle }: { open?: boolean; onToggle?: () => void } = $props();

    import { untrack } from 'svelte';
    import {
        trackerState,
        pinSatellite,
        resetSimClock,
        setSimOffsetMs,
        pauseSimClock,
        resumeSimClock,
        setSimSpeed
    } from '$lib/state.svelte';
    import { catalogByNorad } from '$lib/url-state';
    import {
        SCRUB_SLIDER_STEPS,
        SIM_SPEEDS,
        REALTIME_SNAP_MS,
        simAccuracy,
        scrubOffsetMsToSlider,
        scrubSliderToOffsetMs
    } from '$lib/simclock';
    import Panel from './Panel.svelte';

    let wall = $state(Date.now());
    $effect(() => {
        const id = setInterval(() => (wall = Date.now()), 100);
        return () => clearInterval(id);
    });

    const favoriteEntries = $derived.by(() => {
        // Scan untracked: deep proxy reads must not become effect dependencies.
        const ids = trackerState.favorites;
        const sats = trackerState.satellites;
        if (ids.length === 0 || sats.length === 0) return [];
        return untrack(() => {
            const byNorad = catalogByNorad(sats);
            return ids
                .map((norad) => ({ norad, index: byNorad.get(norad) ?? -1 }))
                .filter((entry) => entry.index >= 0);
        });
    });

    const offsetMs = $derived(trackerState.simEpochMs - wall);
    const atNow = $derived(trackerState.simRealtime);
    const accuracy = $derived(simAccuracy(atNow ? 0 : offsetMs));
    const simUtc = $derived(
        new Date(trackerState.simEpochMs).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    );

    /** Compact signed offset (largest single unit). */
    function formatOffset(ms: number): string {
        if (Math.abs(ms) < 100) return 'now';
        const sign = ms < 0 ? '−' : '+';
        const abs = Math.abs(ms);
        if (abs >= 86_400_000) return `${sign}${(abs / 86_400_000).toFixed(1)} d`;
        if (abs >= 3_600_000) return `${sign}${Math.round(abs / 3_600_000)} h`;
        if (abs >= 60_000) return `${sign}${Math.round(abs / 60_000)} m`;
        return `${sign}${Math.round(abs / 1000)} s`;
    }

    // A drag runs against a paused clock (the slider fights a playing one); symmetric-log ±30d mapping.
    let scrubbing = $state(false);
    let scrubWasPlaying = false;
    let scrubPos = $state(SCRUB_SLIDER_STEPS / 2);
    let scrubStartOffset = 0;

    function displayedSliderPos(): number {
        return atNow ? SCRUB_SLIDER_STEPS / 2 : scrubOffsetMsToSlider(offsetMs);
    }

    function beginScrub(event: Event): void {
        scrubbing = true;
        scrubPos = (event.target as HTMLInputElement).valueAsNumber;
        scrubStartOffset = scrubSliderToOffsetMs(scrubPos);
        scrubWasPlaying = trackerState.simPlaying;
        pauseSimClock();
    }

    function endScrub(event: Event): void {
        const position = (event.target as HTMLInputElement).valueAsNumber;
        if (scrubbing) {
            scrubbing = false;
            if (scrubWasPlaying) resumeSimClock();
        }
        const offset = scrubSliderToOffsetMs(position);
        const snappedLive =
            scrubWasPlaying &&
            trackerState.simPlaying &&
            Math.abs(offset) <= REALTIME_SNAP_MS &&
            !trackerState.simRealtime;
        if (offset !== scrubStartOffset || snappedLive) setSimOffsetMs(offset);
        scrubStartOffset = offset;
    }
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

<Panel title="Controls" {open} {onToggle} bare>
    {#snippet summary()}
        {atNow ? 'Live' : formatOffset(offsetMs)} · {trackerState.simSpeed}×{trackerState.simPlaying
            ? ''
            : ' · paused'}
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

        {#if favoriteEntries.length > 0}
            <div>
                <p class="mb-1 text-[10px] text-brand-text">
                    Favorites ({favoriteEntries.length})
                </p>
                <div
                    class="max-h-24 space-y-0.5 overflow-y-auto pr-1"
                    aria-label="Favorited satellites"
                >
                    {#each favoriteEntries as entry (entry.norad)}
                        <button
                            type="button"
                            class="flex w-full items-center justify-between gap-2 rounded border-0 px-1 py-0.5 text-left text-[11px] text-brand-text transition-colors hover:bg-white/10 {trackerState.pinnedIndex ===
                            entry.index
                                ? 'bg-white/15 text-brand-text-highlight'
                                : ''}"
                            onclick={() => pinSatellite(entry.index)}
                        >
                            <span class="truncate">
                                {trackerState.satellites[entry.index]?.name ??
                                    `NORAD ${entry.norad}`}
                            </span>
                            <span class="shrink-0 font-mono text-[9px] text-brand-text/50"
                                >{entry.norad}</span
                            >
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        <div>
            <p class="mb-1 text-[10px] text-brand-text">Time</p>
            <div class="flex flex-wrap items-center gap-1">
                {@render optionButton(
                    trackerState.simPlaying ? 'Pause' : 'Play',
                    'Pause or resume the simulated clock.',
                    !trackerState.simPlaying,
                    () => (trackerState.simPlaying ? pauseSimClock() : resumeSimClock())
                )}
                {#each SIM_SPEEDS as speed (speed)}
                    {@render optionButton(
                        `${speed}×`,
                        `Simulated time runs ${speed}× faster than real time.`,
                        trackerState.simSpeed === speed,
                        () => setSimSpeed(speed)
                    )}
                {/each}
                {@render optionButton(
                    'Now',
                    'Back to exact real time: offset 0, playing at 1×.',
                    atNow,
                    resetSimClock
                )}
            </div>
            <input
                type="range"
                min={0}
                max={SCRUB_SLIDER_STEPS}
                step={1}
                value={scrubbing ? scrubPos : displayedSliderPos()}
                onpointerdown={beginScrub}
                onpointerup={endScrub}
                onpointercancel={endScrub}
                onchange={endScrub}
                oninput={(event) => {
                    const position = (event.target as HTMLInputElement).valueAsNumber;
                    scrubPos = position;
                    const offset = scrubSliderToOffsetMs(position);
                    scrubStartOffset = offset;
                    setSimOffsetMs(offset);
                }}
                class="mt-2 w-full accent-brand-primary"
                aria-label="Time scrub — log scale, up to ±30 days around real time (1 step ≈ 0.2 s at the center)"
                aria-valuetext={atNow ? 'real time' : `${formatOffset(offsetMs)} from real time`}
            />
            <div class="flex items-center justify-between text-[9px] text-brand-text/60">
                <span>−30 d</span>
                <span class="font-mono text-brand-text">
                    {atNow ? 'now' : formatOffset(offsetMs)}
                </span>
                <span>+30 d</span>
            </div>
            <p class="font-mono text-[10px] text-brand-text-highlight" aria-live="off">
                {simUtc}
            </p>
            {#if accuracy === 'degrading'}
                <p class="mt-1 text-[9px] leading-snug text-brand-text/70">
                    simulated · accuracy degrading — SGP4 extrapolates from TLE epoch, so offsets
                    beyond ~2 days drift
                </p>
            {:else if !atNow}
                <p class="mt-1 text-[9px] leading-snug text-brand-text/70">simulated time</p>
            {/if}
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
