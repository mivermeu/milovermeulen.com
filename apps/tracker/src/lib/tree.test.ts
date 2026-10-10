import { describe, it, expect } from 'bun:test';
import type { ParsedSatellite } from './satellites/types';
import {
    buildRoot,
    toggleNodeInTree,
    collectLeaves,
    extractPrefix,
    starlinkShell,
    type TreeNode
} from './tree';

function sat(name: string): ParsedSatellite {
    return {
        name,
        line1: '1 00000U 00000A   00000.00000000  .00000000  00000-0  00000-0 0  0000',
        line2: '2 00000   0.0000   0.0000 0000000   0.0000   0.0000  0.00000000  0000'
    };
}

function satWithInc(name: string, inc: number): ParsedSatellite {
    return {
        ...sat(name),
        line2: `2 00000 ${inc.toFixed(4).padStart(8)}  0.0000 0000000   0.0000   0.0000  0.00000000  0000`
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

    it('clicking a partial group turns it off before selecting all', () => {
        const root = buildRoot([sat('ISS (ZARYA)'), sat('HST')]);
        const science = root.children.find((c) => c.label === 'Science')!;

        toggleNodeInTree(root, science.children[0].id);
        expect(science.triState).toBe('some');

        toggleNodeInTree(root, science.id);
        expect(science.triState).toBe('none');
        expect(getActive(root)).toHaveLength(0);

        toggleNodeInTree(root, science.id);
        expect(science.triState).toBe('all');
        expect(getActive(root)).toHaveLength(2);
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
    it('STARLINK collapses to one prefix by name', () => {
        expect(extractPrefix('STARLINK-3001')).toBe('STARLINK');
    });
    it('STARLINK shell from inclination', () => {
        expect(
            starlinkShell('2 00000  53.0123  0.0000 0000000   0.0000   0.0000  0.00000000  0000')
        ).toBe('STARLINK 53°');
        expect(
            starlinkShell('2 00000  97.0012  0.0000 0000000   0.0000   0.0000  0.00000000  0000')
        ).toBe('STARLINK 97°');
        expect(starlinkShell('garbage')).toBe('STARLINK');
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
        expect(labels).toContain('GALILEO-221');
        expect(labels).toContain('QZS-2');
        expect(labels).toContain('NAVIC-1G');
    });

    it('STARLINK subcategorized by inclination shell', () => {
        const root = buildRoot([
            satWithInc('STARLINK-1001', 53.0),
            satWithInc('STARLINK-3001', 53.2),
            satWithInc('STARLINK-5001', 70.0),
            satWithInc('STARLINK-5002', 70.1),
            satWithInc('STARLINK-6001', 97.0),
            satWithInc('STARLINK-6002', 97.2)
        ]);
        const comms = root.children.find((c) => c.label === 'Communications')!;
        // 53.0° and 53.2° both round to the same shell; each shell has >= 2 sats so
        // it renders as a group (a lone sat would show its own name instead).
        expect(findInChildren(comms.children, 'STARLINK 53°')!.children.length).toBe(2);
        expect(findInChildren(comms.children, 'STARLINK 70°')!.children.length).toBe(2);
        expect(findInChildren(comms.children, 'STARLINK 97°')!.children.length).toBe(2);
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
        expect(findInChildren(eo.children, 'LANDSAT 8')).toBeDefined();
    });

    it('COSMOS grouped under Military', () => {
        const root = buildRoot([sat('COSMOS 2553'), sat('COSMOS 2251')]);
        const mil = root.children.find((c) => c.label === 'Military')!;
        expect(findInChildren(mil.children, 'COSMOS')!.children.length).toBe(2);
    });

    it('debris and rocket bodies are separated from payloads', () => {
        const root = buildRoot([
            sat('COSMOS 2251 DEB'),
            sat('FENGYUN 1C DEB'),
            sat('ARIANE 5 R/B'),
            sat('COSMOS 2553')
        ]);

        const debris = root.children.find((c) => c.label === 'Debris')!;
        expect(debris.children.map((c) => c.label).sort()).toEqual([
            'ARIANE 5 R/B',
            'COSMOS 2251 DEB',
            'FENGYUN 1C DEB'
        ]);
        expect(findInChildren(debris.children, 'COSMOS 2251 DEB')!.satelliteIndex).toBe(0);

        const mil = root.children.find((c) => c.label === 'Military')!;
        expect(findInChildren(mil.children, 'COSMOS 2553')!.satelliteIndex).toBe(3);
    });

    it('INMARSAT etc. under Communications', () => {
        const root = buildRoot([
            sat('INMARSAT 6-F1'),
            sat('EUTELSAT 10B'),
            sat('SES-22'),
            sat('MOLNIYA-3-60')
        ]);
        const comms = root.children.find((c) => c.label === 'Communications')!;
        expect(comms.children.map((c) => c.label)).toContain('INMARSAT 6-F1');
        expect(comms.children.map((c) => c.label)).toContain('EUTELSAT 10B');
    });
});

describe('object type metadata', () => {
    it('uses SATCAT objectType to classify debris and rocket bodies', () => {
        const root = buildRoot([
            { ...sat('ISS (ZARYA)'), objectType: 'debris' },
            { ...sat('NAVSTAR 80'), objectType: 'rocket-body' }
        ]);
        const debris = root.children.find((c) => c.label === 'Debris')!;
        expect(debris.children.map((c) => c.label).sort()).toEqual(['ISS (ZARYA)', 'NAVSTAR 80']);
    });

    it('trusts an authoritative payload over a debris-looking name', () => {
        const root = buildRoot([{ ...sat('COSMOS 2251 DEB'), objectType: 'payload' }]);
        expect(root.children.find((c) => c.label === 'Debris')).toBeUndefined();
        expect(root.children.find((c) => c.label === 'Military')).toBeDefined();
    });

    it('falls back to the name when objectType is absent or unknown', () => {
        const root = buildRoot([
            sat('COSMOS 2251 DEB'),
            { ...sat('ARIANE 5 R/B'), objectType: 'unknown' }
        ]);
        expect(root.children.find((c) => c.label === 'Debris')).toBeDefined();
    });
});

describe('function category metadata', () => {
    it('uses the fetched category over the name heuristic', () => {
        const root = buildRoot([{ ...sat('COSMOS 2553'), category: 'science' }]);
        expect(root.children.find((c) => c.label === 'Science')).toBeDefined();
        expect(root.children.find((c) => c.label === 'Military')).toBeUndefined();
    });

    it('ignores an unknown category and falls back to the name', () => {
        const root = buildRoot([{ ...sat('COSMOS 2553'), category: 'bogus' }]);
        expect(root.children.find((c) => c.label === 'Military')).toBeDefined();
    });

    it('objectType debris still wins over a category', () => {
        const root = buildRoot([
            { ...sat('ISS (ZARYA)'), objectType: 'debris', category: 'science' }
        ]);
        expect(root.children.find((c) => c.label === 'Debris')).toBeDefined();
        expect(root.children.find((c) => c.label === 'Science')).toBeUndefined();
    });

    it('falls back to the name when no category is present', () => {
        const root = buildRoot([sat('NAVSTAR 80')]);
        expect(root.children.find((c) => c.label === 'Navigation')).toBeDefined();
    });
});

describe('ordering', () => {
    it('sorts groups within a category alphabetically', () => {
        const root = buildRoot([
            sat('GPS BIIF-1'),
            sat('GPS BIIF-2'),
            sat('GLONASS-M 761'),
            sat('GLONASS-M 762'),
            sat('GALILEO-221'),
            sat('GALILEO-222'),
            sat('BEIDOU-3 M1'),
            sat('BEIDOU-3 M2')
        ]);
        const nav = root.children.find((c) => c.label === 'Navigation')!;
        expect(nav.children.map((c) => c.label)).toEqual(['BEIDOU', 'GALILEO', 'GLONASS', 'GPS']);
    });

    it('sorts satellites within a group alphabetically', () => {
        const root = buildRoot([sat('SENTINEL-3A'), sat('SENTINEL-2A'), sat('SENTINEL-2B')]);
        const eo = root.children.find((c) => c.label === 'Earth Observation')!;
        const sentinel = eo.children.find((c) => c.label === 'SENTINEL')!;
        expect(sentinel.children.map((c) => c.label)).toEqual([
            'SENTINEL-2A',
            'SENTINEL-2B',
            'SENTINEL-3A'
        ]);
    });
});

describe('single satellites', () => {
    it('shows the full name for a lone satellite, not its prefix', () => {
        // A-1 (ASTERIX) has prefix "A"; alone it must show the full name.
        const root = buildRoot([sat('A-1 (ASTERIX)')]);
        const other = root.children.find((c) => c.label === 'Other')!;
        expect(other.children.map((c) => c.label)).toEqual(['A-1 (ASTERIX)']);
    });
});
