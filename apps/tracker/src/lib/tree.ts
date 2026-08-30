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
    if (/^(NOAA|METOP|GOES|METEOSAT|HIMAWARI|SUOMI|FY-|ELEKTRO|ARCTICA)/i.test(name))
        functionType = 'weather';
    else if (
        /^(LANDSAT|SENTINEL|TERRA|AQUA|SMAP|SWOT|ICESAT|GRACE|MODIS|ALOS|WORLDVIEW|PLANET)/i.test(
            name
        )
    )
        functionType = 'earth-observation';
    else if (/^(GPS|GALILEO|GLONASS|BEIDOU|QZS|NAVIC|IRNSS)/i.test(name))
        functionType = 'navigation';
    else if (/^(COSMOS|YAOGAN|GAOFEN|JILIN|TANCE|CSOH)/i.test(name)) functionType = 'military';
    else if (
        /^(STARLINK|ONEWEB|IRIDIUM|GLOBALSTAR|FLOCK|SWARM|INMARSAT|INTELSAT|EUTELSAT|SES|TDRS|MOLNIYA)/i.test(
            name
        )
    )
        functionType = 'communications';
    else if (/^(ISS|TIANGONG|HST|CREW DRAGON|CYGNUS|PROGRESS|SOYUZ|SHENZHOU|TIANZHOU)/i.test(name))
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

export function labelConstellation(c: string): string {
    return c.charAt(0).toUpperCase() + c.slice(1);
}

export function extractPrefix(name: string): string {
    if (/^ISS\b/i.test(name)) return 'ISS';
    return name
        .replace(/\s*(DEB|R\/B)\b/gi, '')
        .replace(/[-\s](FM|PFM|DM|SV|BLOCK|BIIF|BM|CM|SLBM|R\/B)\b/gi, '')
        .replace(/[-\s]\d?[A-Z]$|[-\s]M\b|[-\s]?\d+[A-Z]?$|\s\d+$/gi, '')
        .trim();
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

export function flattenSingleChild(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = [];
    for (const node of nodes) {
        const children = flattenSingleChild(node.children);
        if (children.length === 1 && children[0].satelliteIndex === undefined) {
            node.children = children[0].children;
            result.push(node);
        } else {
            node.children = children;
            result.push(node);
        }
    }
    return result;
}

export function computeTriState(node: TreeNode): TriState {
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

export function buildTree(satellites: ParsedSatellite[]): TreeNode[] {
    const functions: Record<string, Record<string, ParsedSatellite[]>> = {};

    for (let i = 0; i < satellites.length; i++) {
        const sat = satellites[i];
        const { functionType, constellation } = categorize(sat.name);
        if (!functions[functionType]) functions[functionType] = {};
        if (!functions[functionType][constellation]) functions[functionType][constellation] = [];
        functions[functionType][constellation].push(sat);
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

    const result = sortedFunctions.map(([funcType, constellations]) => {
        const isSelected = funcType === 'science';
        const constNodes: TreeNode[] = [];

        for (const [constName, sats] of Object.entries(constellations)) {
            const groups = groupByPrefix(sats);
            const constChildren: TreeNode[] = [];

            for (const [groupPrefix, groupSats] of Object.entries(groups)) {
                if (groupSats.length === 1) {
                    const sat = groupSats[0];
                    const satIdx = satellites.indexOf(sat);
                    constChildren.push({
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
                            selected: true,
                            triState: 'all' as TriState,
                            expanded: false,
                            children: []
                        };
                    });
                    constChildren.push({
                        id: `const-${funcType}-${constName}-${groupPrefix}`,
                        label: groupPrefix,
                        selected: isSelected,
                        triState: (isSelected ? 'all' : 'none') as TriState,
                        expanded: false,
                        children: groupChildren
                    });
                }
            }

            if (constChildren.length === 1 && constChildren[0].satelliteIndex !== undefined) {
                constNodes.push(constChildren[0]);
            } else {
                constNodes.push({
                    id: `const-${funcType}-${constName}`,
                    label: labelConstellation(constName),
                    selected: isSelected,
                    triState: (isSelected ? 'all' : 'none') as TriState,
                    expanded: false,
                    children: constChildren
                });
            }
        }

        return {
            id: `func-${funcType}`,
            label: labelFunction(funcType),
            selected: funcType === 'science',
            triState: (funcType === 'science' ? 'all' : 'none') as TriState,
            expanded: false,
            children: constNodes
        };
    });

    return flattenSingleChild(result);
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
