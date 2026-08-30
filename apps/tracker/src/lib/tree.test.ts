import { describe, it, expect } from 'bun:test';
import type { ParsedSatellite } from './satellites/types';
import {
    buildRoot,
    toggleNodeInTree,
    collectLeaves,
    extractPrefix,
    type TreeNode
} from './tree';

function sat(name: string): ParsedSatellite {
    return {
        name,
        line1: '1 00000U 00000A   00000.00000000  .00000000  00000-0  00000-0 0  0000',
        line2: '2 00000   0.0000   0.0000 0000000   0.0000   0.0000  0.00000000  0000'
    };
}

function getActive(root: TreeNode): number[] {
    const active: number[] = [];
    collectLeaves(root, active);
    return active;
}

function findInChildren(nodes: TreeNode[], label: string): TreeNode | undefined {
    return nodes.find((n) => n.label === label);
}

function findAllLeaves(node: TreeNode): string[] {
    if (node.satelliteIndex !== undefined) return [node.label];
    const result: string[] = [];
    for (const child of node.children) {
        result.push(...findAllLeaves(child));
    }
    return result;
}

describe('tree building', () => {
    it('default: only science selected', () => {
        const root = buildRoot([sat('ISS (ZARYA)'), sat('GPS BIIF-1'), sat('STARLINK-3001')]);
        expect(getActive(root)).toHaveLength(1);
    });

    it('select all toggles all descendants', () => {
        const root = buildRoot([sat('ISS (ZARYA)'), sat('HST'), sat('GPS BIIF-1')]);
        expect(getActive(root)).toHaveLength(2);
        toggleNodeInTree(root, 'root');
        expect(getActive(root)).toHaveLength(0);
        toggleNodeInTree(root, 'root');
        expect(getActive(root)).toHaveLength(3);
    });

    it('tri-state: some -> none -> all', () => {
        const root = buildRoot([sat('ISS (ZARYA)'), sat('HST')]);
        const science = root.children.find((c) => c.label === 'Science')!;
        const other = findInChildren(science.children, 'Other')!;
        expect(other.children.length).toBe(2);

        // Deselect first child: other goes from all -> some
        toggleNodeInTree(root, other.children[0].id);
        expect(other.triState).toBe('some');
        expect(getActive(root)).toHaveLength(1);

        // Deselect second child: other goes from some -> none
        toggleNodeInTree(root, other.children[1].id);
        expect(other.triState).toBe('none');
        expect(getActive(root)).toHaveLength(0);

        // Reselect first child: other goes from none -> some
        toggleNodeInTree(root, other.children[0].id);
        expect(other.triState).toBe('some');
        expect(getActive(root)).toHaveLength(1);
    });
});

describe('extractPrefix', () => {
    it('uses first word as prefix', () => {
        expect(extractPrefix('LANDSAT 8')).toBe('LANDSAT');
        expect(extractPrefix('LANDSAT 1 (ERTS 1)')).toBe('LANDSAT');
        expect(extractPrefix('NOAA-19')).toBe('NOAA');
        expect(extractPrefix('GOES-16')).toBe('GOES');
        expect(extractPrefix('METEOSAT-11')).toBe('METEOSAT');
        expect(extractPrefix('HIMAWARI-9')).toBe('HIMAWARI');
        expect(extractPrefix('GPS BIIF-1')).toBe('GPS');
        expect(extractPrefix('COSMOS 2251 DEB')).toBe('COSMOS');
        expect(extractPrefix('INMARSAT 6-F1')).toBe('INMARSAT');
        expect(extractPrefix('EUTELSAT 10B')).toBe('EUTELSAT');
        expect(extractPrefix('SES-22')).toBe('SES');
        expect(extractPrefix('MOLNIYA-3-60')).toBe('MOLNIYA');
    });

    it('STARLINK batches are subcategorized', () => {
        expect(extractPrefix('STARLINK-3001')).toBe('STARLINK-3');
        expect(extractPrefix('STARLINK-3016')).toBe('STARLINK-3');
        expect(extractPrefix('STARLINK-1001')).toBe('STARLINK-1');
    });

    it('groups GLONASS variants', () => {
        expect(extractPrefix('GLONASS-M 761')).toBe('GLONASS');
    });

    it('groups SENTINEL variants', () => {
        expect(extractPrefix('SENTINEL-2A')).toBe('SENTINEL');
        expect(extractPrefix('SENTINEL-3B')).toBe('SENTINEL');
    });
});

describe('grouping in tree', () => {
    it('SENTINEL satellites group together', () => {
        const root = buildRoot([
            sat('SENTINEL-2A'),
            sat('SENTINEL-2B'),
            sat('SENTINEL-3A'),
            sat('SENTINEL-3B'),
            sat('LANDSAT 8')
        ]);
        const eo = root.children.find((c) => c.label === 'Earth Observation')!;
        const other = findInChildren(eo.children, 'Other')!;
        const sentinel = findInChildren(other.children, 'SENTINEL');
        expect(sentinel).toBeDefined();
        expect(sentinel!.children.length).toBe(4);
    });

    it('COSMOS satellites group under Military', () => {
        const root = buildRoot([sat('COSMOS 2553'), sat('COSMOS 2251 DEB')]);
        const mil = root.children.find((c) => c.label === 'Military')!;
        const other = findInChildren(mil.children, 'Other')!;
        const cosmos = findInChildren(other.children, 'COSMOS');
        expect(cosmos).toBeDefined();
        expect(cosmos!.children.length).toBe(2);
    });

    it('STARLINK subcategorized by batch', () => {
        const root = buildRoot([
            sat('STARLINK-1001'),
            sat('STARLINK-1002'),
            sat('STARLINK-3001'),
            sat('STARLINK-3002'),
            sat('ONEWEB-0101')
        ]);
        const comms = root.children.find((c) => c.label === 'Communications')!;
        const starlink = findInChildren(comms.children, 'Starlink')!;
        expect(starlink).toBeDefined();
        expect(findInChildren(starlink.children, 'STARLINK-1')!.children.length).toBe(2);
        expect(findInChildren(starlink.children, 'STARLINK-3')!.children.length).toBe(2);
    });

    it('GLONASS grouped under Navigation', () => {
        const root = buildRoot([sat('GLONASS-M 761'), sat('GLONASS-M 762'), sat('GPS BIIF-1')]);
        const nav = root.children.find((c) => c.label === 'Navigation')!;
        const glonass = findInChildren(nav.children, 'Glonass');
        expect(glonass).toBeDefined();
        expect(glonass!.children.length).toBe(2);
    });

    it('HIMAWARI under Weather', () => {
        const root = buildRoot([sat('HIMAWARI-9'), sat('GOES-16'), sat('GOES-17')]);
        const weather = root.children.find((c) => c.label === 'Weather')!;
        expect(findAllLeaves(weather)).toContain('HIMAWARI-9');
    });

    it('INMARSAT, EUTELSAT, etc. under Communications', () => {
        const root = buildRoot([
            sat('INMARSAT 6-F1'),
            sat('EUTELSAT 10B'),
            sat('SES-22'),
            sat('TDRS-13'),
            sat('MOLNIYA-3-60')
        ]);
        const comms = root.children.find((c) => c.label === 'Communications')!;
        const other = findInChildren(comms.children, 'Other')!;
        const leaves = findAllLeaves(other);
        expect(leaves).toContain('INMARSAT 6-F1');
        expect(leaves).toContain('EUTELSAT 10B');
        expect(leaves).toContain('SES-22');
        expect(leaves).toContain('TDRS-13');
        expect(leaves).toContain('MOLNIYA-3-60');
    });

    it('KAITUO under Earth Observation', () => {
        const root = buildRoot([sat('KAITUO-1B')]);
        const eo = root.children.find((c) => c.label === 'Earth Observation')!;
        expect(findAllLeaves(eo)).toContain('KAITUO-1B');
    });
});
