import { describe, it, expect } from 'bun:test';
import type { ParsedSatellite } from './satellites/types';
import { buildRoot, toggleNodeInTree, collectLeaves, extractPrefix, type TreeNode } from './tree';

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

describe('tree building', () => {
    it('default: only science selected', () => {
        const root = buildRoot([sat('ISS (ZARYA)'), sat('GPS BIIF-1'), sat('STARLINK-3001')]);
        expect(getActive(root)).toHaveLength(1);
    });

    it('select all toggles all', () => {
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
        expect(science.children.length).toBe(2);

        toggleNodeInTree(root, science.children[0].id);
        expect(science.triState).toBe('some');

        toggleNodeInTree(root, science.children[1].id);
        expect(science.triState).toBe('none');
        expect(getActive(root)).toHaveLength(0);

        toggleNodeInTree(root, science.children[0].id);
        expect(science.triState).toBe('some');
    });
});

describe('extractPrefix', () => {
    it('uses first word', () => {
        expect(extractPrefix('LANDSAT 8')).toBe('LANDSAT');
        expect(extractPrefix('NOAA-19')).toBe('NOAA');
        expect(extractPrefix('GOES-16')).toBe('GOES');
        expect(extractPrefix('GPS BIIF-1')).toBe('GPS');
        expect(extractPrefix('COSMOS 2251 DEB')).toBe('COSMOS');
    });
    it('STARLINK batches', () => {
        expect(extractPrefix('STARLINK-3001')).toBe('STARLINK-3');
        expect(extractPrefix('STARLINK-1001')).toBe('STARLINK-1');
    });
});

describe('grouping', () => {
    it('Navigation: GPS, GLONASS, GALILEO as siblings', () => {
        const root = buildRoot([
            sat('GPS BIIF-1'),
            sat('GPS BIIF-2'),
            sat('GLONASS-M 761'),
            sat('GLONASS-M 762'),
            sat('GALILEO-221'),
            sat('QZS-2'),
            sat('NAVIC-1G')
        ]);
        const nav = root.children.find((c) => c.label === 'Navigation')!;
        const labels = nav.children.map((c) => c.label);
        expect(labels).toContain('GPS');
        expect(labels).toContain('GLONASS');
        expect(labels).toContain('GALILEO');
        expect(labels).toContain('QZS');
        expect(labels).toContain('NAVIC');
    });

    it('STARLINK subcategorized by batch', () => {
        const root = buildRoot([
            sat('STARLINK-1001'),
            sat('STARLINK-1002'),
            sat('STARLINK-3001'),
            sat('STARLINK-3002')
        ]);
        const comms = root.children.find((c) => c.label === 'Communications')!;
        expect(findInChildren(comms.children, 'STARLINK-1')!.children.length).toBe(2);
        expect(findInChildren(comms.children, 'STARLINK-3')!.children.length).toBe(2);
    });

    it('SENTINEL grouped under Earth Observation', () => {
        const root = buildRoot([
            sat('SENTINEL-2A'),
            sat('SENTINEL-2B'),
            sat('SENTINEL-3A'),
            sat('LANDSAT 8')
        ]);
        const eo = root.children.find((c) => c.label === 'Earth Observation')!;
        expect(findInChildren(eo.children, 'SENTINEL')!.children.length).toBe(3);
        expect(findInChildren(eo.children, 'LANDSAT')).toBeDefined();
    });

    it('COSMOS grouped under Military', () => {
        const root = buildRoot([sat('COSMOS 2553'), sat('COSMOS 2251 DEB')]);
        const mil = root.children.find((c) => c.label === 'Military')!;
        expect(findInChildren(mil.children, 'COSMOS')!.children.length).toBe(2);
    });

    it('INMARSAT etc. under Communications', () => {
        const root = buildRoot([
            sat('INMARSAT 6-F1'),
            sat('EUTELSAT 10B'),
            sat('SES-22'),
            sat('MOLNIYA-3-60')
        ]);
        const comms = root.children.find((c) => c.label === 'Communications')!;
        expect(comms.children.map((c) => c.label)).toContain('INMARSAT');
        expect(comms.children.map((c) => c.label)).toContain('EUTELSAT');
    });
});
