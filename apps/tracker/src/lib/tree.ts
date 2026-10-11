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

const FUNCTION_CATEGORIES = new Set([
    'communications',
    'navigation',
    'earth-observation',
    'weather',
    'science',
    'military',
    'debris',
    'other'
]);

export function categorize(name: string, objectType?: string, category?: string): string {
    if (objectType === 'debris' || objectType === 'rocket-body') return 'debris';

    // Fetched function category (CelesTrak groups) is authoritative when present.
    if (category && FUNCTION_CATEGORIES.has(category)) return category;

    // Otherwise infer debris from the name (unless SATCAT says payload).
    if (objectType !== 'payload' && /\bDEB\b|\bR\/B\b|\bROCKET BODY\b/i.test(name)) {
        return 'debris';
    }

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

    return functionType;
}

export function labelFunction(f: string): string {
    const labels: Record<string, string> = {
        communications: 'Communications',
        navigation: 'Navigation',
        'earth-observation': 'Earth Observation',
        weather: 'Weather',
        science: 'Science',
        military: 'Military',
        debris: 'Debris',
        other: 'Other'
    };
    return labels[f] ?? f;
}

export function extractPrefix(name: string): string {
    const m = name.match(/^\w+/);
    return m ? m[0] : name;
}

// Starlink satellites are organized by orbital shell, which the TLE inclination
// (line 2, cols 9-16) separates cleanly. Group them by whole-degree shell rather
// than the arbitrary catalog-number buckets.
export function starlinkShell(line2: string): string {
    const inclination = Math.round(parseFloat(line2.slice(8, 16)));
    return Number.isFinite(inclination) ? `STARLINK ${inclination}°` : 'STARLINK';
}

function groupKey(sat: ParsedSatellite): string {
    if (/^STARLINK/i.test(sat.name)) return starlinkShell(sat.line2);
    return extractPrefix(sat.name);
}

export function groupByPrefix(sats: ParsedSatellite[]): Record<string, ParsedSatellite[]> {
    const groups: Record<string, ParsedSatellite[]> = {};
    for (const sat of sats) {
        const prefix = groupKey(sat);
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
        const functionType = categorize(sat.name, sat.objectType, sat.category);
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
        'debris',
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
                    label: sat.name,
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
                groupChildren.sort((a, b) => a.label.localeCompare(b.label));
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

        funcChildren.sort((a, b) => a.label.localeCompare(b.label));

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

// An all-digit query is treated as a NORAD catalog ID (prefix match, so typing
// "2554" narrows toward ISS's 25544); anything else matches labels as before.
export function findMatchingNodeIds(
    root: TreeNode,
    query: string,
    satellites?: ParsedSatellite[]
): { matching: Set<string>; expand: Set<string> } {
    const matching = new Set<string>();
    const expand = new Set<string>();
    if (!query) return { matching, expand };
    const lower = query.toLowerCase();
    const norad =
        /^\d+$/.test(query) && satellites
            ? (node: TreeNode) => {
                  if (node.satelliteIndex === undefined) return false;
                  const id = satellites[node.satelliteIndex]?.noradId;
                  return id !== undefined && id !== null && String(id).startsWith(query);
              }
            : null;

    function walk(node: TreeNode): boolean {
        let selfMatch = node.label.toLowerCase().includes(lower);
        if (!selfMatch && norad) selfMatch = norad(node);
        let childMatch = false;
        for (const child of node.children) {
            if (walk(child)) childMatch = true;
        }
        // A node that matches the query itself stays collapsed — the user said
        // "starlink", not "all 10,000 starlinks" — and only unfurls to reveal
        // matched descendants when its own label doesn't match.
        if (childMatch && !selfMatch) expand.add(node.id);
        const hasMatch = selfMatch || childMatch;
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
