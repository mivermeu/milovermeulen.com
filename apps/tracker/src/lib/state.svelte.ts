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
import type { GraphBrush } from '$lib/graphBrush';
import type { ParamKey } from '$lib/graph-params';
import {
    type SimSpeed,
    clampSimEpoch,
    DEFAULT_SIM_SPEED,
    REALTIME_SNAP_MS,
    stepSimClock
} from '$lib/simclock';

export type { TreeNode, TriState } from '$lib/tree';

const SIM_CLOCK_TICK_MS = 50;

// Render anchor for per-frame interpolation between ticks; re-anchored on every epoch assign.
let renderAnchor: { epoch: number; wall: number } = { epoch: Date.now(), wall: Date.now() };

function assignSimEpoch(epochMs: number, wallMs: number = Date.now()): void {
    trackerState.simEpochMs = epochMs;
    renderAnchor = { epoch: epochMs, wall: wallMs };
}

/** Per-frame display epoch: ticked epoch extrapolated by wall time × speed (capped at two ticks). */
export function renderEpochMs(): number {
    if (!trackerState.simPlaying) return trackerState.simEpochMs;
    const elapsed = Math.max(0, Math.min(Date.now() - renderAnchor.wall, 2 * SIM_CLOCK_TICK_MS));
    return renderAnchor.epoch + elapsed * trackerState.simSpeed;
}

export interface HoverInfo {
    originalIndex: number;
    name: string;
    screenX: number;
    screenY: number;
}

/** Defaults for URL-mirrored fields (`url-state.ts` types against these, so changes break compilation there). */
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
    showGroundTrack: true,
    dataSource: 'loading' as DataSource,
    staleHidden: 0,
    error: '',
    referenceFrame: INITIAL_URL_PARAMS.frame as 'ecf' | 'eci',
    elementMode: INITIAL_URL_PARAMS.mode as 'epoch' | 'smoothed' | 'instantaneous',
    // One shared epoch drives globe, graph, and info panel. `simScrubSeq` counts
    // clock jumps so propagation can snap views onto post-jump snapshots.
    simEpochMs: Date.now(),
    simPlaying: true,
    simSpeed: DEFAULT_SIM_SPEED,
    // Mode, not derived arithmetic, so the UI never flickers.
    simRealtime: true,
    simScrubSeq: 0,
    hovered: null as HoverInfo | null,
    hoveredIndex: -1,
    pinnedIndex: -1,
    graphXKey: INITIAL_URL_PARAMS.graphXKey as ParamKey,
    graphYKey: INITIAL_URL_PARAMS.graphYKey as ParamKey,
    favorites: [] as number[],
    panelsOpen: typeof matchMedia !== 'undefined' && matchMedia('(min-width: 768px)').matches,
    tree: null as TreeNode | null,
    activeIndices: [] as number[],
    searchQuery: '',
    graphBrush: null as GraphBrush | null,
    // Flags over the worker's TREE-filtered index space (1 = in brush), in filtered slot order.
    brushMask: null as Uint8Array | null
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

/** Pin by catalog index, activating/revealing its filter-tree row. Returns true if it exists. */
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
    const now = Date.now();
    assignSimEpoch(now, now);
    trackerState.simRealtime = true;
    trackerState.simPlaying = true;
    trackerState.simSpeed = DEFAULT_SIM_SPEED;
    // NOW is a clock jump too — bump the revision so views snap instead of blending.
    trackerState.simScrubSeq++;
}

/** Pause freezes the epoch; paused-at-now leaves real-time mode since the live feed marches on. */
export function pauseSimClock(): void {
    trackerState.simRealtime = false;
    trackerState.simPlaying = false;
}

/** Resume from the frozen epoch, re-joining real time when within REALTIME_SNAP_MS of now. */
export function resumeSimClock(): void {
    const now = Date.now();
    const drift = now - trackerState.simEpochMs;
    if (Math.abs(drift) <= REALTIME_SNAP_MS) {
        assignSimEpoch(now, now);
        trackerState.simRealtime = true;
        trackerState.simSpeed = DEFAULT_SIM_SPEED;
    } else {
        assignSimEpoch(trackerState.simEpochMs, now);
        trackerState.simRealtime = false;
    }
    trackerState.simScrubSeq++;
    trackerState.simPlaying = true;
}

/** Set sim speed; an unchanged 1× selection is a no-op so it can't kick a live clock out of real time. */
export function setSimSpeed(speed: SimSpeed): void {
    if (trackerState.simSpeed === speed) return;
    // Re-anchor at the displayed instant so elapsed wall time isn't re-priced at the new speed.
    assignSimEpoch(renderEpochMs(), Date.now());
    trackerState.simRealtime = false;
    trackerState.simSpeed = speed;
}

/** Jump the clock via the scrub slider; near-zero offsets re-engage the live feed. Bumps simScrubSeq so views snap. */
export function setSimOffsetMs(offsetMs: number): void {
    if (!Number.isFinite(offsetMs)) return;
    const now = Date.now();
    if (Math.abs(offsetMs) <= REALTIME_SNAP_MS && trackerState.simPlaying) {
        assignSimEpoch(now, now);
        trackerState.simRealtime = true;
        trackerState.simSpeed = DEFAULT_SIM_SPEED;
    } else {
        assignSimEpoch(clampSimEpoch(now + offsetMs, now), now);
        trackerState.simRealtime = false;
    }
    trackerState.simScrubSeq++;
}

if (browser) {
    // Central simulated clock: one interval advances the shared epoch; real-time mode pins it to the wall clock.
    let lastTickWall = Date.now();
    setInterval(() => {
        const now = Date.now();
        const elapsedRealMs = Math.max(0, Math.min(now - lastTickWall, 2 * SIM_CLOCK_TICK_MS));
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
