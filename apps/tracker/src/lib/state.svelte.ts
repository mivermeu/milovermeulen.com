import { browser } from '$app/environment';
import { loadCatalog } from '$lib/satellites/tle';
import type { DataSource, ParsedSatellite } from '$lib/satellites/types';
import {
    type TreeNode,
    buildRoot,
    toggleNodeInTree,
    findNode,
    collectLeaves,
    findLeafByIndex,
    revealLeafNode,
    activateLeafNode
} from '$lib/tree';
import type { ParamKey } from '$lib/graph-params';
import {
    type SimSpeed,
    clampSimEpoch,
    DEFAULT_SIM_SPEED,
    REALTIME_SNAP_MS,
    stepSimClock
} from '$lib/simclock';

export type { TreeNode, TriState } from '$lib/tree';

// High-resolution render anchor. The shared clock ticks at SIM_CLOCK_TICK_MS,
// but renderers run per RAF frame — rendering from the ticked value advances
// motion in tick-sized steps, and at 600× one tick is ~30 s of simulated travel
// (order-10 px on the globe) landing every few frames. Views therefore read
// `renderEpochMs()`, which interpolates the epoch between ticks at frame rate;
// the anchor is re-recorded whenever the epoch is assigned, so scrubs, NOW and
// resume all stay exact.
let renderAnchor: { epoch: number; wall: number } = { epoch: 0, wall: Date.now() };

/** Assign the shared epoch and re-anchor the per-frame interpolation. */
function assignSimEpoch(epochMs: number, wallMs: number = Date.now()): void {
    trackerState.simEpochMs = epochMs;
    renderAnchor = { epoch: epochMs, wall: wallMs };
}

/**
 * The epoch the renderers should display this frame: the last ticked epoch
 * extrapolated by elapsed wall time × speed — continuous at any speed, never
 * step-quantized to the clock tick. While paused it is simply the frozen
 * value. (It may run roughly one tick past the scrub-window edges; that's
 * sub-second of harmless overshoot.)
 */
export function renderEpochMs(): number {
    if (!trackerState.simPlaying) return trackerState.simEpochMs;
    return renderAnchor.epoch + (Date.now() - renderAnchor.wall) * trackerState.simSpeed;
}

export interface HoverInfo {
    originalIndex: number;
    name: string;
    screenX: number;
    screenY: number;
}

/**
 * Initial values for the URL-mirrored state fields — the single source of
 * truth for both `trackerState`'s defaults and the URL encoder's defaults
 * (`url-state.ts` types its DEFAULT_URL_PARAMS against these `as const`
 * literals, so a change here breaks compilation there instead of drifting).
 */
export const INITIAL_URL_PARAMS = {
    mode: 'smoothed',
    frame: 'ecf',
    graphXKey: 'perigee',
    graphYKey: 'apogee'
} as const;

export type InitialUrlParams = typeof INITIAL_URL_PARAMS;

export const trackerState = $state({
    satellites: [] as ParsedSatellite[],
    showOrbits: true,
    showEquatorial: false,
    // Pinned satellite's nadir ground track polyline (one orbital period into the future, ECF).
    showGroundTrack: true,
    dataSource: 'loading' as DataSource,
    staleHidden: 0,
    error: '',
    // Casts widen the literal initial values from INITIAL_URL_PARAMS to the
    // full unions these fields hold at runtime.
    referenceFrame: INITIAL_URL_PARAMS.frame as 'ecf' | 'eci',
    // Which orbital-element set the graph plots and the explorer draws.
    elementMode: INITIAL_URL_PARAMS.mode as 'epoch' | 'smoothed' | 'instantaneous',
    // The shared simulated clock: one epoch drives the globe, the graph, and
    // the info panel — no view keeps its own time. Defaults are exactly
    // real-time (epoch = now, playing, 1×), so today's behavior is unchanged
    // until a control is touched. `simScrubSeq` counts user clock jumps (scrub
    // slider, NOW) so propagation can snap views onto post-jump snapshots.
    simEpochMs: Date.now(),
    simPlaying: true,
    simSpeed: DEFAULT_SIM_SPEED, // True while the epoch is pinned to the wall clock (offset 0, 1×, playing)
    // — the default and the state the Now button re-engages. Making this a
    // mode rather than an offset arithmetic result is what keeps the UI from
    // flickering: a tick-quantized epoch compared against a coarse wall-clock
    // sample never sits at offset exactly 0, so a derived "atNow" would flip
    // every few hundred milliseconds.
    simRealtime: true,
    simScrubSeq: 0,
    hovered: null as HoverInfo | null,
    // Satellite under the pointer in either view (globe or graph), or -1.
    hoveredIndex: -1,
    pinnedIndex: -1,
    // Graph axis keys — component-local before, but shared state so URL deep
    // links (`gx`/`gy`) can seed and mirror them.
    graphXKey: INITIAL_URL_PARAMS.graphXKey as ParamKey,
    graphYKey: INITIAL_URL_PARAMS.graphYKey as ParamKey,
    // Favorited satellites by NORAD catalog number (persisted to localStorage).
    favorites: [] as number[],
    // Right-hand panels drawer; open by default on desktop-sized viewports.
    panelsOpen: typeof matchMedia !== 'undefined' && matchMedia('(min-width: 768px)').matches,
    tree: null as TreeNode | null,
    activeIndices: [] as number[],
    searchQuery: ''
});

export function toggleNode(id: string): void {
    const tree = trackerState.tree;
    if (!tree) return;

    const active = toggleNodeInTree(tree, id);
    trackerState.activeIndices = active;

    if (trackerState.pinnedIndex >= 0 && !active.includes(trackerState.pinnedIndex)) {
        trackerState.pinnedIndex = -1;
    }
}

export function toggleExpand(id: string): void {
    const node = findNode(trackerState.tree, id);
    if (node) node.expanded = !node.expanded;
}

export function initTree(satellites: ParsedSatellite[]): void {
    trackerState.tree = buildRoot(satellites);
    const active: number[] = [];
    collectLeaves(trackerState.tree, active);
    trackerState.activeIndices = active;
}

/**
 * Pin a satellite by catalog index and, through the filter tree (still the
 * source of truth for visibility — no rows are injected), activate it if the
 * filter had it hidden, then reveal its row. Used by favorites and URL `sat`
 * deep links. Returns true if the satellite exists.
 */
export function pinSatellite(index: number): boolean {
    if (!trackerState.satellites[index]) return false;
    trackerState.pinnedIndex = index;
    const tree = trackerState.tree;
    const leaf = tree ? findLeafByIndex(tree, index) : null;
    if (tree && leaf) {
        if (!trackerState.activeIndices.includes(index)) {
            trackerState.activeIndices = activateLeafNode(tree, leaf);
        }
        revealLeafNode(tree, leaf);
    }
    return true;
}

/** Reset to exactly real time: offset 0, playing, 1×. */
export function resetSimClock(): void {
    assignSimEpoch(Date.now());
    trackerState.simRealtime = true;
    trackerState.simPlaying = true;
    trackerState.simSpeed = DEFAULT_SIM_SPEED;
    // NOW is a clock jump too — the propagation service promotes it to a
    // regime-revision bump so views snap instead of blending across it.
    trackerState.simScrubSeq++;
}

/**
 * Pause freezes the epoch where it is. Paused-at-now is still simulated time
 * (the live feed marches on without you), so this leaves real-time mode —
 * the offset starts growing relative to the wall clock.
 */
export function pauseSimClock(): void {
    trackerState.simRealtime = false;
    trackerState.simPlaying = false;
}

/**
 * Resume from the frozen epoch — unless the freeze happened so close to now
 * (within `REALTIME_SNAP_MS`) that a pause/play round-trip shouldn't cost the
 * live feed; then re-join real time.
 */
export function resumeSimClock(): void {
    const drift = Date.now() - trackerState.simEpochMs;
    if (drift >= 0 && drift <= REALTIME_SNAP_MS) {
        assignSimEpoch(Date.now());
        trackerState.simRealtime = true;
    } else {
        trackerState.simRealtime = false;
    }
    // Re-anchor from the frozen epoch so the per-frame interpolation starts
    // where the pause left off, not from a pre-pause anchor.
    assignSimEpoch(trackerState.simEpochMs);
    trackerState.simScrubSeq++;
    trackerState.simPlaying = true;
}

/** Set the sim speed. An unchanged 1× selection is a no-op so hovering the
 * speed row can't silently kick a live clock out of real-time mode. */
export function setSimSpeed(speed: SimSpeed): void {
    if (trackerState.simSpeed === speed) return;
    trackerState.simRealtime = false;
    trackerState.simSpeed = speed;
}

/**
 * Jump the clock via the scrub slider. `offsetMs` is the desired offset from
 * real time, clamped to the ±30 day scrub window; offsets within the
 * realtime snap of zero re-engage the live feed instead of parking the clock
 * a fraction of a second off. A user scrub is an explicit regime change:
 * `simScrubSeq` tells the propagation service to revision-bump the next
 * stamped snapshot so the views snap onto it (magnitude heuristics stay as
 * backstop for gaps no user action explains).
 */
export function setSimOffsetMs(offsetMs: number): void {
    if (!Number.isFinite(offsetMs)) return;
    const now = Date.now();
    // Real-time implies playing (the tick pins the epoch to the wall clock
    // only while running), so parked-clock scrubs never end in a "now" label
    // over frozen data.
    if (Math.abs(offsetMs) <= REALTIME_SNAP_MS && trackerState.simPlaying) {
        assignSimEpoch(now, now);
        trackerState.simRealtime = true;
    } else {
        assignSimEpoch(clampSimEpoch(now + offsetMs, now), now);
        trackerState.simRealtime = false;
    }
    trackerState.simScrubSeq++;
}

if (browser) {
    // The central simulated clock: a single interval advances the shared epoch
    // by elapsed real time × speed while playing. Every view reads
    // `simEpochMs` from here — stepping math lives in $lib/simclock. In
    // real-time mode the epoch is pinned to the wall clock each tick instead
    // of stepped, so the offset stays exactly 0 by construction.
    const SIM_CLOCK_TICK_MS = 50;
    let lastTickWall = Date.now();
    setInterval(() => {
        const now = Date.now();
        const elapsedRealMs = now - lastTickWall;
        lastTickWall = now;
        if (!trackerState.simPlaying) return;
        if (trackerState.simRealtime) {
            assignSimEpoch(now, now);
            return;
        }
        assignSimEpoch(
            stepSimClock(trackerState.simEpochMs, elapsedRealMs, trackerState.simSpeed, now),
            now
        );
    }, SIM_CLOCK_TICK_MS);

    loadCatalog().then(({ satellites, source, error, staleHidden }) => {
        trackerState.satellites = satellites;
        trackerState.dataSource = source;
        trackerState.staleHidden = staleHidden ?? 0;
        trackerState.error = error ?? '';
        initTree(satellites);
    });
}
