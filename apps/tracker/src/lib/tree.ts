import type { ParsedSatellite } from './satellites/types';

export type TriState = 'all' | 'some' | 'none';

export interface TreeNode {
    id: string;
    label: string;
    satelliteIndex?: number;
    selected: boolean;
    triState: TriState;
    expanded: boolean;
    children: TreeNode[];
}

export function categorize(name: string): { functionType: string; constellation: string } {
    let constellation = 'other';
    if (/^STARLINK/i.test(name)) constellation = 'starlink';
    else if (/^ONEWEB/i.test(name)) constellation = 'oneweb';
    else if (/^IRIDIUM/i.test(name)) constellation = 'iridium';
    else if (/^GPS/i.test(name)) constellation = 'gps';
    else if (/^GALILEO/i.test(name)) constellation = 'galileo';
    else if (/^GLONASS/i.test(name)) constellation = 'glonass';
    else if (/^BEIDOU/i.test(name)) constellation = 'beidou';

    let functionType = 'other';
    if (
        /^(NOAA|METOP|GOES|METEOSAT|HIMAWARI|SUOMI|FY-|ELEKTRO|ARCTICA|MTSAT|INSAT|TIROS|NPP|JPSS|GCOM|COSPAS|MSG)/i.test(
            name
        )
    )
        functionType = 'weather';
    else if (
        /^(LANDSAT|SENTINEL|TERRA|AQUA|SMAP|SWOT|ICESAT|GRACE|MODIS|ALOS|WORLDVIEW|PLANET|KAITUO|SPOT|RADARSAT|CBERS|PROBA|ENVISAT|ERS|JASON|KOMPSAT|COSMO-SKYMED|TERRASAR|TANDEM|QUICKBIRD|IKONOS|OCEANSAT|RISAT|CAPELLA|ICEYE|BLACKSKY|ALBEDO|PIXXEL|GHGSAT|ORORATECH|BIOMASS|SAOCOM|DEIMOS|DMC|MEGHA|SHIZUKU|SHIKISAI)/i.test(
            name
        )
    )
        functionType = 'earth-observation';
    else if (/^(GPS|NAVSTAR|GALILEO|GLONASS|BEIDOU|QZS|NAVIC|IRNSS)/i.test(name))
        functionType = 'navigation';
    else if (/COSMOS.*GLONASS|GLONASS.*COSMOS/i.test(name)) functionType = 'navigation';
    else if (
        /^(COSMOS|YAOGAN|GAOFEN|JILIN|TANCE|CSOH|USA-|KH-|LACROSSE|MISTY|ORION|MENTOR|SDS|QUASAR|SAR.LUPE|SAPPHIRE|PRAETORIAN|STSS|SBIRS)/i.test(
            name
        )
    )
        functionType = 'military';
    else if (
        /^(STARLINK|ONEWEB|IRIDIUM|GLOBALSTAR|FLOCK|SWARM|INMARSAT|INTELSAT|EUTELSAT|SES|TDRS|MOLNIYA|ASTRA|ORBCOMM|TELSAT|VIASAT|HUGHES|AMOS|HISPASAT|NILESAT|ARABSAT|THURAYA|ABS|MEXSAT|SIRIUM|XM-|SIRIUS|SKYNET|LUCH|GORIZONT|EXPRES|YAMAL|KUIPER|GUOWANG|QIANFAN)/i.test(
            name
        )
    )
        functionType = 'communications';
    else if (
        /^(ISS|TIANGONG|HST|JWST|CREW DRAGON|CYGNUS|PROGRESS|SOYUZ|SHENZHOU|TIANZHOU|CHANDRA|KEPLER|TESS|FERMI|WMAP|PLANCK|HERSCHEL|IXPE|NUSTAR|SDO|SORCE|CALIPSO|CLOUDSAT|OCO|AQUARIUS|SMOS|CFOSAT|SCATSAT|HY-)/i.test(
            name
        )
    )
        functionType = 'science';

    return { functionType, constellation };
}

export function labelFunction(f: string): string {
    const labels: Record<string, string> = {
        communications: 'Communications',
        navigation: 'Navigation',
        'earth-observation': 'Earth Observation',
        weather: 'Weather',
        science: 'Science',
        military: 'Military',
        other: 'Other'
    };
    return labels[f] ?? f;
}

export function extractPrefix(name: string): string {
    if (/^STARLINK-/i.test(name)) {
        const m = name.match(/^STARLINK-(\d+)/i);
        if (m) return `STARLINK-${Math.floor(parseInt(m[1]) / 1000)}`;
        return 'STARLINK';
    }
    const m = name.match(/^\w+/);
    return m ? m[0] : name;
}

export function groupByPrefix(sats: ParsedSatellite[]): Record<string, ParsedSatellite[]> {
    const groups: Record<string, ParsedSatellite[]> = {};
    for (const sat of sats) {
        const prefix = extractPrefix(sat.name);
        if (!groups[prefix]) groups[prefix] = [];
        groups[prefix].push(sat);
    }
    return groups;
}

function computeTriState(node: TreeNode): TriState {
    if (node.children.length === 0) return node.selected ? 'all' : 'none';
    const states = node.children.map(computeTriState);
    if (states.every((s) => s === 'all')) return 'all';
    if (states.every((s) => s === 'none')) return 'none';
    return 'some';
}

export function computeTriStates(node: TreeNode): void {
    for (const child of node.children) {
        computeTriStates(child);
    }
    if (node.children.length > 0) {
        node.triState = computeTriState(node);
    } else {
        node.triState = node.selected ? 'all' : 'none';
    }
}

export function setDescendants(node: TreeNode, selected: boolean): void {
    node.selected = selected;
    for (const child of node.children) {
        setDescendants(child, selected);
    }
}

export function findNode(root: TreeNode | null, id: string): TreeNode | null {
    if (!root) return null;
    if (root.id === id) return root;
    return findNodeInChildren(root.children, id);
}

function findNodeInChildren(nodes: TreeNode[], id: string): TreeNode | null {
    for (const node of nodes) {
        if (node.id === id) return node;
        const found = findNodeInChildren(node.children, id);
        if (found) return found;
    }
    return null;
}

export function collectLeaves(node: TreeNode, result: number[]): void {
    if (node.satelliteIndex !== undefined && node.selected) {
        result.push(node.satelliteIndex);
    }
    for (const child of node.children) {
        collectLeaves(child, result);
    }
}

function buildTree(satellites: ParsedSatellite[]): TreeNode[] {
    const functions: Record<string, ParsedSatellite[]> = {};

    for (let i = 0; i < satellites.length; i++) {
        const sat = satellites[i];
        const { functionType } = categorize(sat.name);
        if (!functions[functionType]) functions[functionType] = [];
        functions[functionType].push(sat);
    }

    const funcOrder = [
        'science',
        'navigation',
        'earth-observation',
        'weather',
        'communications',
        'military',
        'other'
    ];
    const sortedFunctions = Object.entries(functions).sort(
        (a, b) => funcOrder.indexOf(a[0]) - funcOrder.indexOf(b[0])
    );

    const result = sortedFunctions.map(([funcType, sats]) => {
        const isSelected = funcType === 'science';
        const groups = groupByPrefix(sats);
        const funcChildren: TreeNode[] = [];

        for (const [groupPrefix, groupSats] of Object.entries(groups)) {
            if (groupSats.length === 1) {
                const sat = groupSats[0];
                const satIdx = satellites.indexOf(sat);
                funcChildren.push({
                    id: `sat-${satIdx}`,
                    label: groupPrefix,
                    satelliteIndex: satIdx,
                    selected: isSelected,
                    triState: (isSelected ? 'all' : 'none') as TriState,
                    expanded: false,
                    children: []
                });
            } else {
                const groupChildren: TreeNode[] = groupSats.map((sat) => {
                    const satIdx = satellites.indexOf(sat);
                    return {
                        id: `sat-${satIdx}`,
                        label: sat.name,
                        satelliteIndex: satIdx,
                        selected: isSelected,
                        triState: (isSelected ? 'all' : 'none') as TriState,
                        expanded: false,
                        children: []
                    };
                });
                funcChildren.push({
                    id: `group-${funcType}-${groupPrefix}`,
                    label: groupPrefix,
                    selected: isSelected,
                    triState: (isSelected ? 'all' : 'none') as TriState,
                    expanded: false,
                    children: groupChildren
                });
            }
        }

        return {
            id: `func-${funcType}`,
            label: labelFunction(funcType),
            selected: isSelected,
            triState: (isSelected ? 'all' : 'none') as TriState,
            expanded: false,
            children: funcChildren
        };
    });

    return result;
}

export function buildRoot(satellites: ParsedSatellite[]): TreeNode {
    const children = buildTree(satellites);
    const root = {
        id: 'root',
        label: 'All satellites',
        selected: false,
        triState: 'none' as TriState,
        expanded: true,
        children
    };
    computeTriStates(root);
    return root;
}

export function toggleNodeInTree(root: TreeNode, id: string): number[] {
    const node = findNode(root, id);
    if (!node) return [];

    if (node.triState === 'some') {
        node.selected = false;
    } else {
        node.selected = !node.selected;
    }
    setDescendants(node, node.selected);
    computeTriStates(root);
    const active: number[] = [];
    collectLeaves(root, active);
    return active;
}

export function findMatchingNodeIds(
    root: TreeNode,
    query: string
): { matching: Set<string>; expand: Set<string> } {
    const matching = new Set<string>();
    const expand = new Set<string>();
    if (!query) return { matching, expand };
    const lower = query.toLowerCase();

    function walk(node: TreeNode): boolean {
        let hasMatch = node.label.toLowerCase().includes(lower);
        for (const child of node.children) {
            if (walk(child)) {
                expand.add(node.id);
                hasMatch = true;
            }
        }
        if (hasMatch) matching.add(node.id);
        return hasMatch;
    }

    walk(root);
    return { matching, expand };
}

export function saveExpanded(root: TreeNode, target: Map<string, boolean>): void {
    target.set(root.id, root.expanded);
    for (const child of root.children) saveExpanded(child, target);
}

export function restoreExpanded(root: TreeNode, saved: Map<string, boolean>): void {
    const v = saved.get(root.id);
    if (v !== undefined) root.expanded = v;
    for (const child of root.children) restoreExpanded(child, saved);
}
