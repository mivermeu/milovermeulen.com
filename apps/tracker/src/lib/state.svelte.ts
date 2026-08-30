import { browser } from '$app/environment';
import { loadCatalog } from '$lib/satellites/tle';
import type { DataSource, ParsedSatellite } from '$lib/satellites/types';
import {
    type TreeNode,
    buildRoot,
    computeTriStates,
    setDescendants,
    findNode,
    collectLeaves
} from '$lib/tree';

export type { TreeNode, TriState } from '$lib/tree';

export const SPEED_OPTIONS = [
    { label: 'Pause', value: 0 },
    { label: '1×', value: 1 },
    { label: '5×', value: 5 },
    { label: '15×', value: 15 },
    { label: '60×', value: 60 }
] as const;

export interface HoverInfo {
    originalIndex: number;
    name: string;
    screenX: number;
    screenY: number;
}

export const trackerState = $state({
    satellites: [] as ParsedSatellite[],
    showOrbits: true,
    speed: 1,
    dataSource: 'loading' as DataSource,
    error: '',
    simDateTime: '',
    simTimeMs: Date.now(),
    setSimTime: null as ((ms: number) => void) | null,
    referenceFrame: 'ecf' as 'ecf' | 'eci',
    hovered: null as HoverInfo | null,
    pinnedIndex: -1,
    tree: null as TreeNode | null,
    activeIndices: [] as number[],
    searchQuery: ''
});

export function toggleNode(id: string): void {
    const node = findNode(trackerState.tree, id);
    if (!node) return;

    node.selected = !node.selected;
    setDescendants(node, node.selected);
    if (trackerState.tree) computeTriStates(trackerState.tree);

    const active: number[] = [];
    if (trackerState.tree) collectLeaves(trackerState.tree, active);
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

if (browser) {
    loadCatalog().then(({ satellites, source, error }) => {
        trackerState.satellites = satellites;
        trackerState.dataSource = source;
        trackerState.error = error ?? '';
        initTree(satellites);
    });
}
