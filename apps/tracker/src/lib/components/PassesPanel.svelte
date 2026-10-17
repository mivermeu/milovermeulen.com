<script lang="ts">
    let { open = true, onToggle }: { open?: boolean; onToggle?: () => void } = $props();

    import { trackerState } from '$lib/state.svelte';
    import { parseLatitude, parseLongitude } from '$lib/geo';
    import {
        clearLocation,
        observerState,
        requestGeolocation,
        setManualLocation
    } from '$lib/observer.svelte';
    import { propagation, type WorkerResponse } from '$lib/propagation';
    import { PASS_MIN_EL_DEG } from '$lib/passes';
    import type { PassRow } from '$lib/passes';
    import Panel from './Panel.svelte';
    import InfoTip from './InfoTip.svelte';

    // Search configuration: horizon, window length, list size. The satellite
    // cap lives with the worker (passes.ts's PASS_SEARCH_MAX_SATS) and is
    // surfaced through the response's capInfo.
    const MIN_EL_DEG = PASS_MIN_EL_DEG;
    // Search window: LEO objects pass several times a day, so the top-20
    // fills within hours — a multi-day window only burns worker time and
    // trips the search budget. 48 hours covers "tonight and tomorrow".
    const WINDOW_DAYS = 2;
    const MAX_PASSES = 20;

    let latText = $state('');
    let lonText = $state('');
    let formError = $state('');
    let formOpen = $state(false);

    let passes = $state<PassRow[]>([]);
    let capInfo = $state<{ active: number; searched: number; capped: boolean } | null>(null);
    let partial = $state(false);
    let searching = $state(false);

    // Worker request bookkeeping: seq identifies the in-flight request;
    // generation tracks the worker catalog so stale responses are dropped.
    let seq = 0;
    let generation = $state(-1);
    let hasCatalog = $state(false);

    function handleWorkerMessage(message: WorkerResponse): void {
        if (message.type === 'ready') {
            generation = message.generation ?? -1;
            hasCatalog = (message.count ?? 0) > 0;
            return;
        }
        // A worker-level error means no 'passes' response is coming; clear the
        // spinner so the panel doesn't promise a search forever.
        if (message.type === 'error') {
            searching = false;
            return;
        }
        if (message.type !== 'passes') return;
        if (message.requestId !== seq) return;
        if ((message.generation ?? -1) !== generation) return;
        passes = message.passes ?? [];
        partial = message.partial ?? false;
        capInfo = message.capInfo ?? null;
        searching = false;
    }

    // Subscribe once; worker callbacks run outside the effect's tracking.
    $effect(() => propagation.subscribe(handleWorkerMessage));

    let nowMs = $state(Date.now());
    $effect(() => {
        const id = setInterval(() => (nowMs = Date.now()), 1000);
        return () => clearInterval(id);
    });

    const locationSet = $derived(
        observerState.lat !== null &&
            observerState.lon !== null &&
            (observerState.status === 'set' || observerState.status === 'locating')
    );

    /**
     * Re-search when the location, the tree-filtered set, or the worker
     * catalog changes. Debounced — filter trees fire several updates per
     * interaction while the worker re-inits its own catalog.
     */
    $effect(() => {
        const lat = observerState.lat;
        const lon = observerState.lon;
        const indices = trackerState.activeIndices;
        // `generation` is read for its dependency: a fresh worker catalog means
        // the request fires only after the re-init settled.
        if (
            generation < 0 ||
            !locationSet ||
            lat === null ||
            lon === null ||
            indices.length === 0 ||
            !hasCatalog
        ) {
            searching = false;
            return;
        }
        const timer = setTimeout(() => {
            searching = true;
            seq++;
            propagation.findPasses({
                requestId: seq,
                observer: { latDeg: lat, lonDeg: lon },
                startMs: Date.now(),
                endMs: Date.now() + WINDOW_DAYS * 86_400_000,
                minElDeg: MIN_EL_DEG,
                maxPasses: MAX_PASSES,
                originalIndices: indices
            });
        }, 600);
        return () => clearTimeout(timer);
    });

    /** Immediate re-search (drawer refresh button). */
    function refresh(): void {
        const lat = observerState.lat;
        const lon = observerState.lon;
        const indices = trackerState.activeIndices;
        if (lat === null || lon === null || indices.length === 0 || !hasCatalog) return;
        searching = true;
        seq++;
        propagation.findPasses({
            requestId: seq,
            observer: { latDeg: lat, lonDeg: lon },
            startMs: Date.now(),
            endMs: Date.now() + WINDOW_DAYS * 86_400_000,
            minElDeg: MIN_EL_DEG,
            maxPasses: MAX_PASSES,
            originalIndices: indices
        });
    }

    function submitManual(event: SubmitEvent): void {
        event.preventDefault();
        const lat = parseLatitude(latText);
        const lon = parseLongitude(lonText);
        if (lat === null || lon === null) {
            formError =
                'Enter valid coordinates — latitude −90…90, longitude −180…180 (decimal degrees).';
            return;
        }
        formError = '';
        setManualLocation(lat, lon);
        formOpen = false;
    }

    function togglePin(row: PassRow): void {
        trackerState.pinnedIndex = trackerState.pinnedIndex === row.index ? -1 : row.index;
    }

    // Rows are filtered live so passes disappear once they are over.
    const visiblePasses = $derived(passes.filter((p) => p.endMs > nowMs));

    function formatDeg(value: number, pos: string, neg: string): string {
        const abs = Math.abs(value);
        return `${abs.toFixed(2)}°${value >= 0 ? pos : neg}`;
    }

    function pad2(n: number): string {
        return String(Math.floor(Math.abs(n))).padStart(2, '0');
    }

    /** Live countdown until rise (spec: mm:ss when inside the hour). */
    function countdown(msUntilStart: number): string {
        if (msUntilStart <= 0) return 'now';
        const totalSec = Math.floor(msUntilStart / 1000);
        const days = Math.floor(totalSec / 86400);
        const hours = Math.floor((totalSec % 86400) / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        const hms = `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}`;
        return days > 0 ? `${days}d ${hms}` : hours > 0 ? hms : `${pad2(minutes)}:${pad2(secs)}`;
    }

    function inProgress(pass: PassRow): boolean {
        return pass.startMs <= nowMs && nowMs <= pass.endMs;
    }
</script>

<Panel title="Passes" {open} {onToggle} bare>
    {#snippet summary()}
        {searching ? 'Searching…' : !locationSet ? 'No location' : `${visiblePasses.length} found`}
    {/snippet}
    {#snippet actions()}
        <span class="flex items-center gap-1">
            <InfoTip label="About this pass list">
                Top {MAX_PASSES} by start time.<br />
                Next {WINDOW_DAYS} days · horizon {MIN_EL_DEG}°.<br />
                Low-orbit satellites only (perigee ≤ 2,000 km).<br />
                Click a row to pin it.
            </InfoTip>
            {#if locationSet && !formOpen}
                <button
                    type="button"
                    aria-label="Refresh pass search"
                    title="Refresh pass search"
                    onclick={refresh}
                    class="flex h-6 w-6 items-center justify-center rounded border border-brand-secondary bg-transparent text-sm leading-none text-brand-text outline-hidden hover:bg-white/10 focus-visible:bg-white/10"
                >
                    ↻
                </button>
            {/if}
        </span>
    {/snippet}

    {#if !locationSet || formOpen}
        <form onsubmit={submitManual} aria-label="Set observer location">
            <p class="mb-2 text-[10px] leading-snug text-brand-text">
                Passes are computed for a fixed observer location. Use your device location or enter
                coordinates manually (decimal degrees).
            </p>
            <div class="flex gap-2">
                <div class="w-1/2">
                    <label for="pass-lat" class="mb-0.5 block text-[10px] text-brand-text"
                        >Latitude (−90…90)</label
                    >
                    <input
                        id="pass-lat"
                        type="text"
                        inputmode="decimal"
                        autocomplete="off"
                        bind:value={latText}
                        placeholder="47.38"
                        class="w-full rounded border border-white/20 bg-transparent px-2 py-1 text-xs text-brand-text placeholder:text-brand-text/40 focus:border-brand-primary focus:outline-none"
                    />
                </div>
                <div class="w-1/2">
                    <label for="pass-lon" class="mb-0.5 block text-[10px] text-brand-text"
                        >Longitude (−180…180)</label
                    >
                    <input
                        id="pass-lon"
                        type="text"
                        inputmode="decimal"
                        autocomplete="off"
                        bind:value={lonText}
                        placeholder="8.54"
                        class="w-full rounded border border-white/20 bg-transparent px-2 py-1 text-xs text-brand-text placeholder:text-brand-text/40 focus:border-brand-primary focus:outline-none"
                    />
                </div>
            </div>
            <div class="mt-2 flex items-center gap-2">
                <button
                    type="submit"
                    class="rounded border border-brand-secondary bg-transparent px-2 py-1 text-xs text-brand-text-highlight hover:bg-white/10"
                >
                    Save location
                </button>
                <button
                    type="button"
                    disabled={observerState.status === 'locating'}
                    onclick={() => requestGeolocation()}
                    aria-busy={observerState.status === 'locating'}
                    class="rounded border border-brand-secondary bg-transparent px-2 py-1 text-xs text-brand-text hover:bg-white/10 disabled:opacity-50"
                >
                    {observerState.status === 'locating'
                        ? 'Locating…'
                        : observerState.status === 'denied'
                          ? 'Try again'
                          : 'Use my location'}
                </button>
                {#if formOpen && locationSet}
                    <button
                        type="button"
                        onclick={() => (formOpen = false)}
                        class="ml-auto text-[10px] text-brand-text hover:text-brand-text-highlight"
                    >
                        Cancel
                    </button>
                {/if}
            </div>
            <p aria-live="polite" class="mt-1 min-h-4 text-[10px] text-[#f43f5e]">
                {formError || observerState.error}
            </p>
            {#if observerState.deniedHard && !formError}
                <p class="mt-1 text-[10px] leading-snug text-brand-text/70">
                    Safari remembers this choice: re-allow it under Safari → Settings → Websites →
                    Location (Mac) or Settings → Apps → Safari → Location (iPhone), then tap Try
                    again. (System Location Services must be on for Safari.)
                </p>
            {/if}
        </form>
    {:else}
        <div class="mb-2 flex items-center justify-between text-[10px] text-brand-text">
            <span>
                {formatDeg(observerState.lat ?? 0, 'N', 'S')}
                {formatDeg(observerState.lon ?? 0, 'E', 'W')}
            </span>
            <span class="flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    onclick={() => {
                        latText = (observerState.lat ?? 0).toFixed(4);
                        lonText = (observerState.lon ?? 0).toFixed(4);
                        formError = '';
                        formOpen = true;
                    }}
                    class="rounded border border-brand-secondary bg-transparent px-1.5 py-0.5 text-[10px] text-brand-text outline-hidden hover:bg-white/10 focus-visible:bg-white/10"
                >
                    Edit
                </button>
                <button
                    type="button"
                    onclick={() => clearLocation()}
                    aria-label="Forget observer location"
                    class="ml-1 rounded border border-brand-secondary bg-transparent px-1.5 py-0.5 text-[10px] text-brand-text outline-hidden hover:bg-white/10 focus-visible:bg-white/10"
                >
                    Forget
                </button>
            </span>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
            {#if searching}
                <p aria-live="polite" class="py-3 text-center text-[10px] text-brand-text">
                    Searching next {WINDOW_DAYS} days…
                </p>
            {:else if !hasCatalog || trackerState.satellites.length === 0}
                <p aria-live="polite" class="py-3 text-center text-[10px] text-brand-text">
                    Catalog is still loading…
                </p>
            {:else if trackerState.activeIndices.length === 0}
                <p aria-live="polite" class="py-3 text-center text-[10px] text-brand-text">
                    Nothing is selected in Filters — enable some satellites to search passes.
                </p>
            {:else if visiblePasses.length === 0}
                <p aria-live="polite" class="py-3 text-center text-[10px] text-brand-text">
                    No passes above {MIN_EL_DEG}° here in the next {WINDOW_DAYS} days{partial
                        ? ' (search incomplete — try again)'
                        : ''}
                    .
                </p>
            {:else}
                <div class="flex flex-col gap-1" aria-live="off">
                    {#each visiblePasses as pass (pass.index + '-' + pass.startMs)}
                        <button
                            type="button"
                            aria-pressed={trackerState.pinnedIndex === pass.index}
                            onclick={() => togglePin(pass)}
                            class="flex w-full flex-col items-stretch gap-0.5 rounded border px-2 py-1 text-left transition-colors {trackerState.pinnedIndex ===
                            pass.index
                                ? 'border-brand-primary bg-white/15'
                                : 'border-transparent hover:bg-white/10'}"
                        >
                            <span class="flex items-baseline justify-between gap-2">
                                <span class="truncate text-xs font-medium text-brand-text-highlight"
                                    >{pass.name}</span
                                >
                                <span
                                    class="shrink-0 font-mono text-[10px] {inProgress(pass)
                                        ? 'text-[#22c55e]'
                                        : 'text-brand-text'}"
                                >
                                    {inProgress(pass) ? 'up now' : countdown(pass.startMs - nowMs)}
                                </span>
                            </span>
                            <span
                                class="flex items-baseline justify-between gap-2 text-[10px] text-brand-text"
                            >
                                <span class="font-mono text-brand-text-highlight"
                                    >max {pass.maxElDeg.toFixed(0)}°</span
                                >
                                <span class="font-mono">
                                    rise {pass.startAzDeg.toFixed(0)}°/{pass.startElDeg.toFixed(0)}°
                                </span>
                            </span>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <p class="shrink-0 pt-1 text-[10px] leading-snug text-brand-text">
            {#if capInfo?.capped}
                Searching {capInfo.searched} of {capInfo.active} passable satellites (shortest-period
                first).
            {/if}
            {#if partial && visiblePasses.length > 0}
                Search budget reached — later passes may be missing.
            {/if}
        </p>
    {/if}
</Panel>
