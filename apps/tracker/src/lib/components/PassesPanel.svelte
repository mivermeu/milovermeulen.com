<script lang="ts">
    import { trackerState } from '$lib/state.svelte';
    import {
        clearLocation,
        observerState,
        parseManualEntry,
        requestGeolocation,
        setManualLocation
    } from '$lib/observer.svelte';
    import { propagation, type WorkerResponse } from '$lib/propagation';
    import type { PassRow } from '$lib/passes';
    import Panel from './Panel.svelte';

    // Search configuration: horizon, window length, list size, satellite cap.
    const MIN_EL_DEG = 10;
    const WINDOW_DAYS = 7;
    const MAX_PASSES = 20;
    const MAX_SATS = 2000;

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
                maxSats: MAX_SATS,
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
            maxSats: MAX_SATS,
            originalIndices: indices
        });
    }

    function submitManual(event: SubmitEvent): void {
        event.preventDefault();
        const entry = parseManualEntry(latText, lonText);
        if (!entry) {
            formError =
                'Enter valid coordinates — latitude −90…90, longitude −180…180 (decimal degrees).';
            return;
        }
        formError = '';
        setManualLocation(entry.lat, entry.lon);
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

<Panel title="Passes">
    {#snippet actions()}
        {#if locationSet && !formOpen}
            <button
                type="button"
                aria-label="Refresh pass search"
                title="Refresh pass search"
                onclick={refresh}
                class="flex h-6 w-6 items-center justify-center rounded border border-brand-secondary bg-transparent text-xs text-brand-text hover:bg-white/10"
            >
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5" aria-hidden="true">
                    <path
                        fill-rule="evenodd"
                        d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 100-1.5H4.598a.75.75 0 00-.75.75v3.635a.75.75 0 001.5 0v-2.866l.418.418a7 7 0 1011.707-3.141.75.75 0 00-1.16.949z"
                        clip-rule="evenodd"
                    />
                </svg>
            </button>
        {/if}
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
                    {observerState.status === 'locating' ? 'Locating…' : 'Use my location'}
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
        </form>
    {:else}
        <div class="mb-2 flex items-center justify-between text-[10px] text-brand-text">
            <span>
                {formatDeg(observerState.lat ?? 0, 'N', 'S')}
                {formatDeg(observerState.lon ?? 0, 'E', 'W')} · next {WINDOW_DAYS} days · horizon {MIN_EL_DEG}°
            </span>
            <button
                type="button"
                onclick={() => {
                    latText = (observerState.lat ?? 0).toFixed(4);
                    lonText = (observerState.lon ?? 0).toFixed(4);
                    formError = '';
                    formOpen = true;
                }}
                class="hover:text-brand-text-highlight"
            >
                Edit
            </button>
            <button
                type="button"
                onclick={() => clearLocation()}
                aria-label="Forget observer location"
                class="ml-1 text-[10px] text-brand-text hover:text-brand-text-highlight"
            >
                Forget
            </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
            {#if searching}
                <p class="py-3 text-center text-[10px] text-brand-text">
                    Searching next {WINDOW_DAYS} days…
                </p>
            {:else if !hasCatalog || trackerState.satellites.length === 0}
                <p class="py-3 text-center text-[10px] text-brand-text">
                    Catalog is still loading…
                </p>
            {:else if trackerState.activeIndices.length === 0}
                <p class="py-3 text-center text-[10px] text-brand-text">
                    Nothing is selected in Filters — enable some satellites to search passes.
                </p>
            {:else if visiblePasses.length === 0}
                <p class="py-3 text-center text-[10px] text-brand-text">
                    No passes above {MIN_EL_DEG}° here in the next {WINDOW_DAYS} days{partial
                        ? ' (search incomplete — try again)'
                        : ''}
                    .
                </p>
            {:else}
                <div class="flex flex-col gap-1">
                    {#each visiblePasses as pass (pass.index + '-' + pass.startMs)}
                        <button
                            type="button"
                            aria-pressed={trackerState.pinnedIndex === pass.index}
                            aria-label="Pin {pass.name}"
                            onclick={() => togglePin(pass)}
                            class="flex w-full flex-col gap-0.5 rounded border px-2 py-1 text-left transition-colors {trackerState.pinnedIndex ===
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
                Searching {capInfo.searched} of {capInfo.active} satellites (shortest-period first).
            {/if}
            {#if partial && visiblePasses.length > 0}
                Search budget reached — later passes may be missing.
            {/if}
            Top {MAX_PASSES} by start time; click a row to pin it.
        </p>
    {/if}
</Panel>
