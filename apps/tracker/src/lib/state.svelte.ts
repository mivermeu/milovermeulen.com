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

export type { TreeNode, TriState } from '$lib/tree';

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

if (browser) {
    loadCatalog().then(({ satellites, source, error, staleHidden }) => {
        trackerState.satellites = satellites;
        trackerState.dataSource = source;
        trackerState.staleHidden = staleHidden ?? 0;
        trackerState.error = error ?? '';
        initTree(satellites);
    });
}
