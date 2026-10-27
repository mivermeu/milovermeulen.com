import { describe, expect, test } from 'bun:test';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { networkGeoJSON, paintTrains, stationsGeoJSON, trainGeoJSON } from './map';
import { routeColor } from './palette';
import type { Graph, PatternGeometry, TrainPosition } from './types';

/** Lat/lon pairs chosen so float32 round-trips exactly. */
function geometry(id: string, route: string, line: [number, number][]): PatternGeometry {
    return {
        id,
        route,
        dir: 'N',
        length: 1000,
        stops: [],
        line: new Float32Array(line.flat()),
        cumulative: new Float32Array(line.length)
    };
}

const graph: Graph = {
    v: 1,
    built_at: 0,
    feed_version: null,
    stations: [
        { id: 'S1', name: 'Times Sq–42 St', lat: 40.755, lon: -73.987 },
        { id: 'S2', name: 'Grand Central–42 St', lat: 40.752, lon: -73.977 }
    ],
    platforms: [],
    shapes: [],
    patterns: [
        { id: '1-n', route: '1', dir: 'N', shape: 'sh1', length_m: 1000, stops: [] },
        { id: '6X-s', route: '6X', dir: 'S', shape: 'sh2', length_m: 2000, stops: [] },
        { id: 'A-n', route: 'A', dir: 'N', shape: 'sh3', length_m: 3000, stops: [] }
    ]
};

const geometries = new Map<string, PatternGeometry>([
    [
        '1-n',
        geometry('1-n', '1', [
            [40.5, -73.75],
            [40.75, -73.5]
        ])
    ],
    [
        '6X-s',
        geometry('6X-s', '6X', [
            [40.25, -73.25],
            [40.5, -73.0],
            [40.75, -72.75]
        ])
    ]
]);

const trains: TrainPosition[] = [
    {
        id: 't1',
        lng: -73.9,
        lat: 40.7,
        route: '6X',
        routeColor: routeColor('6X'),
        stale: true,
        reset: false,
        confidence: 0.8,
        positioned: true
    },
    {
        id: 't2',
        lng: -73.8,
        lat: 40.6,
        route: 'A',
        routeColor: routeColor('A'),
        stale: false,
        reset: true,
        confidence: 0.2,
        positioned: false
    }
];

describe('routeColor', () => {
    test('maps each route family to its official colour', () => {
        expect(routeColor('1')).toBe('#EE352E');
        expect(routeColor('2')).toBe('#EE352E');
        expect(routeColor('3')).toBe('#EE352E');
        expect(routeColor('5')).toBe('#00933C');
        expect(routeColor('7')).toBe('#B933AD');
        expect(routeColor('C')).toBe('#0039A6');
        expect(routeColor('F')).toBe('#FF6319');
        expect(routeColor('G')).toBe('#6CBE45');
        expect(routeColor('Z')).toBe('#996633');
        expect(routeColor('L')).toBe('#A7A9AC');
        expect(routeColor('W')).toBe('#FCCC0A');
        expect(routeColor('GS')).toBe('#808183');
        expect(routeColor('H')).toBe('#808183');
        expect(routeColor('SI')).toBe('#1E90FF');
    });

    test('strips variant suffixes', () => {
        expect(routeColor('6X')).toBe('#00933C');
        expect(routeColor('7X')).toBe('#B933AD');
        expect(routeColor('FX')).toBe('#FF6319');
    });

    test('falls back for missing and unknown routes', () => {
        expect(routeColor(null)).toBe('#cbd5e1');
        expect(routeColor('')).toBe('#cbd5e1');
        expect(routeColor('Z9')).toBe('#cbd5e1');
    });

    test('is case-insensitive', () => {
        expect(routeColor('l')).toBe('#A7A9AC');
        expect(routeColor(' 6x ')).toBe('#00933C');
    });
});

describe('networkGeoJSON', () => {
    test('emits one LineString per pattern with geometry', () => {
        const collection = networkGeoJSON(graph, geometries);

        expect(collection.type).toBe('FeatureCollection');
        expect(collection.features).toHaveLength(2);
        expect(collection.features.map((feature) => feature.id)).toEqual(['1-n', '6X-s']);
    });

    test('swaps the lat/lon buffer into [lng, lat]', () => {
        const collection = networkGeoJSON(graph, geometries);
        const line = collection.features[0].geometry;

        expect(line.type).toBe('LineString');
        expect(line.coordinates).toEqual([
            [-73.75, 40.5],
            [-73.5, 40.75]
        ]);
    });

    test('keeps every buffer point, in order', () => {
        const collection = networkGeoJSON(graph, geometries);
        const line = collection.features[1].geometry;

        expect(line.coordinates).toHaveLength(3);
        expect(line.coordinates[2]).toEqual([-72.75, 40.75]);
    });

    test('carries route, id and colour properties', () => {
        const collection = networkGeoJSON(graph, geometries);
        const [one, six] = collection.features;

        expect(one.properties).toEqual({ id: '1-n', route: '1', color: '#EE352E' });
        expect(six.properties).toEqual({ id: '6X-s', route: '6X', color: '#00933C' });
    });

    test('skips patterns without decoded geometry', () => {
        const collection = networkGeoJSON(graph, new Map());

        expect(collection.features).toHaveLength(0);
    });
});

describe('stationsGeoJSON', () => {
    test('emits one Point per station as [lng, lat]', () => {
        const collection = stationsGeoJSON(graph);

        expect(collection.features).toHaveLength(2);
        expect(collection.features[0].geometry).toEqual({
            type: 'Point',
            coordinates: [-73.987, 40.755]
        });
        expect(collection.features[1].properties.name).toBe('Grand Central–42 St');
    });
});

describe('trainGeoJSON', () => {
    test('emits [lng, lat] points with render properties', () => {
        const collection = trainGeoJSON(trains);

        expect(collection.features).toHaveLength(2);

        const [first] = collection.features;
        expect(first.id).toBe('t1');
        expect(first.geometry).toEqual({ type: 'Point', coordinates: [-73.9, 40.7] });
        expect(first.properties).toEqual({
            id: 't1',
            route: '6X',
            color: '#00933C',
            stale: true,
            reset: false,
            confidence: 0.8,
            positioned: true,
            selected: false
        });
    });

    test('reflects reset trains', () => {
        const collection = trainGeoJSON(trains);
        const reset = collection.features[1];

        expect(reset.properties.reset).toBe(true);
        expect(reset.properties.stale).toBe(false);
        expect(reset.properties.positioned).toBe(false);
    });

    test('handles an empty position list', () => {
        expect(trainGeoJSON([]).features).toHaveLength(0);
    });
});

describe('paintTrains', () => {
    test('drops the update when the source is missing', () => {
        const map = { getSource: () => undefined } as unknown as MapLibreMap;

        expect(() => paintTrains(map, trains)).not.toThrow();
    });

    test('only pushes data through setData', () => {
        const pushed: unknown[] = [];
        const source = { setData: (data: unknown) => pushed.push(data) };
        const map = { getSource: () => source } as unknown as MapLibreMap;

        paintTrains(map, trains);

        expect(pushed).toHaveLength(1);
        expect(pushed[0]).toEqual(trainGeoJSON(trains));
    });
});
