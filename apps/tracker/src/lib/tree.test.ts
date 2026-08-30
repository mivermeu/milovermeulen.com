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

function countLeaves(node: TreeNode): number {
    if (node.satelliteIndex !== undefined) return 1;
    let count = 0;
    for (const child of node.children) count += countLeaves(child);
    return count;
}

function getActive(root: TreeNode): number[] {
    const active: number[] = [];
    collectLeaves(root, active);
    return active;
}

describe('tree building', () => {
    it('groups satellites by function', () => {
        const sats = [
            sat('ISS (ZARYA)'),
            sat('HST'),
            sat('GPS BIIF-1'),
            sat('GPS BIIF-2'),
            sat('STARLINK-3001'),
            sat('STARLINK-3002'),
            sat('COSMOS 2251 DEB')
        ];
        const root = buildRoot(sats);
        const funcLabels = root.children.map((c) => c.label);
        expect(funcLabels).toContain('Science');
        expect(funcLabels).toContain('Navigation');
        expect(funcLabels).toContain('Communications');
        expect(funcLabels).toContain('Military');
    });

    it('flattens single-child levels preserving parent label', () => {
        const sats = [sat('ISS (ZARYA)'), sat('HST')];
        const root = buildRoot(sats);
        const science = root.children.find((c) => c.label === 'Science');
        expect(science).toBeDefined();
        // Science -> Other -> [sats] becomes Science -> [sats]
        expect(science!.children.map((c) => c.label)).not.toContain('Other');
        expect(countLeaves(science!)).toBe(2);
    });

    it('flattens single-satellite constellations to function level', () => {
        const sats = [sat('STARLINK-3001'), sat('STARLINK-3002'), sat('ONEWEB-0101')];
        const root = buildRoot(sats);
        const comms = root.children.find((c) => c.label === 'Communications');
        expect(comms).toBeDefined();
        // STARLINK group stays, ONEWEB flattened to function level
        expect(comms!.children.map((c) => c.label)).toContain('Starlink');
        expect(countLeaves(comms!)).toBe(3);
    });

    it('has root node', () => {
        const root = buildRoot([sat('ISS (ZARYA)')]);
        expect(root.id).toBe('root');
        expect(root.label).toBe('All satellites');
    });
    it('select all toggles all descendants', () => {
        const sats = [sat('ISS (ZARYA)'), sat('HST'), sat('GPS BIIF-1')];
        const root = buildRoot(sats);
        // Default: only science selected
        expect(getActive(root)).toHaveLength(2);

        toggleNodeInTree(root, 'root');
        expect(getActive(root)).toHaveLength(0);

        toggleNodeInTree(root, 'root');
        expect(getActive(root)).toHaveLength(3);
    });
    it('deselecting one child marks parent as some', () => {
        const sats = [sat('ISS (ZARYA)'), sat('HST')];
        const root = buildRoot(sats);
        // Both science sats selected by default
        expect(getActive(root)).toHaveLength(2);
        const science = root.children.find((c) => c.label === 'Science')!;
        toggleNodeInTree(root, science.children[0].id);
        expect(science.triState).toBe('some');
        expect(root.triState).toBe('some');
        expect(getActive(root)).toHaveLength(1);
    });

    it('deselecting all children marks parent as none', () => {
        const sats = [sat('ISS (ZARYA)'), sat('HST')];
        const root = buildRoot(sats);
        const science = root.children.find((c) => c.label === 'Science')!;
        toggleNodeInTree(root, science.children[0].id);
        toggleNodeInTree(root, science.children[1].id);
        expect(science.triState).toBe('none');
        expect(getActive(root)).toHaveLength(0);
    });

    it('reselecting all marks parent as all', () => {
        const sats = [sat('ISS (ZARYA)'), sat('HST')];
        const root = buildRoot(sats);
        const science = root.children.find((c) => c.label === 'Science')!;
        toggleNodeInTree(root, science.children[0].id);
        toggleNodeInTree(root, science.children[1].id);
        toggleNodeInTree(root, science.children[0].id);
        toggleNodeInTree(root, science.children[1].id);
        expect(science.triState).toBe('all');
        expect(getActive(root)).toHaveLength(2);
    });
});

describe('extractPrefix', () => {
    it('groups GLONASS variants under GLONASS', () => {
        expect(extractPrefix('GLONASS-M 761')).toBe('GLONASS');
        expect(extractPrefix('GLONASS-M 762')).toBe('GLONASS');
    });

    it('groups SENTINEL variants under SENTINEL', () => {
        expect(extractPrefix('SENTINEL-2A')).toBe('SENTINEL');
        expect(extractPrefix('SENTINEL-2B')).toBe('SENTINEL');
        expect(extractPrefix('SENTINEL-3A')).toBe('SENTINEL');
    });

    it('strips DEB and R/B suffixes', () => {
        expect(extractPrefix('COSMOS 2251 DEB')).toBe('COSMOS');
        // Falcon 9 is a single sat - prefix can be "Falcon" or "Falcon 9"
        expect(['Falcon', 'Falcon 9']).toContain(extractPrefix('Falcon 9 R/B'));
    });

    it('strips trailing numbers', () => {
        expect(extractPrefix('NOAA-19')).toBe('NOAA');
        expect(extractPrefix('GOES-16')).toBe('GOES');
        expect(extractPrefix('GPS BIIF-1')).toBe('GPS');
        expect(extractPrefix('STARLINK-3001')).toBe('STARLINK');
    });

    it('preserves multi-word prefixes', () => {
        expect(extractPrefix('MOLNIYA-3-60')).toBe('MOLNIYA-3');
        expect(extractPrefix('FLOCK 4A-1')).toBe('FLOCK 4A');
        expect(extractPrefix('SUOMI NPP')).toBe('SUOMI NPP');
    });
});
