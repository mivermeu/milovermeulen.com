import { addProtocol, type StyleSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';

/**
 * Context basemap for the transit map: a self-hosted PMTiles extract of the
 * Protomaps basemap (z10–13, ~21 MB), hand-styled dark and **labels-free** so no
 * glyph/sprite pipeline is needed.
 *
 * The archive is not committed (21 MB); see `scripts/fetch-transit-tiles.sh`.
 * Set `VITE_TRANSIT_TILES_URL` to host it elsewhere. If it is missing, the map
 * still renders on its background and the transit layers are unaffected.
 */

let registered = false;

export function registerPmtilesProtocol(): void {
    if (registered) return;
    addProtocol('pmtiles', new Protocol().tile);
    registered = true;
}

// SvelteKit's BASE_URL has no trailing slash (`/transit`), so join explicitly.
// Bun's test runner does not populate it, hence the fallback.
const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');
const DEFAULT_TILES = `${BASE}/tiles/nyc-basemap-z13.pmtiles`;

export const TILES_URL =
    (import.meta.env.VITE_TRANSIT_TILES_URL as string | undefined) || DEFAULT_TILES;

const ATTRIBUTION =
    '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap</a>';

export function basemapStyle(tilesUrl: string = TILES_URL): StyleSpecification {
    return {
        version: 8,
        sources: {
            basemap: {
                type: 'vector',
                url: `pmtiles://${tilesUrl}`,
                attribution: ATTRIBUTION
            }
        },
        layers: [
            {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#0b0f1a' }
            },
            {
                id: 'earth',
                type: 'fill',
                source: 'basemap',
                'source-layer': 'earth',
                paint: { 'fill-color': '#111722' }
            },
            {
                id: 'water',
                type: 'fill',
                source: 'basemap',
                'source-layer': 'water',
                filter: ['all', ['!=', ['get', 'bridge'], true], ['!=', ['get', 'tunnel'], true]],
                paint: { 'fill-color': '#070c17' }
            },
            {
                id: 'landuse-park',
                type: 'fill',
                source: 'basemap',
                'source-layer': 'landuse',
                filter: [
                    'match',
                    ['get', 'kind'],
                    [
                        'park',
                        'national_park',
                        'nature_reserve',
                        'forest',
                        'golf_course',
                        'recreation_ground',
                        'grass',
                        'garden',
                        'cemetery',
                        'pitch',
                        'playground'
                    ],
                    true,
                    false
                ],
                paint: { 'fill-color': '#15201c' }
            },
            {
                id: 'landuse-campus',
                type: 'fill',
                source: 'basemap',
                'source-layer': 'landuse',
                filter: [
                    'match',
                    ['get', 'kind'],
                    ['university', 'school', 'hospital', 'industrial'],
                    true,
                    false
                ],
                paint: { 'fill-color': '#131a26' }
            },
            {
                id: 'roads-casing',
                type: 'line',
                source: 'basemap',
                'source-layer': 'roads',
                minzoom: 10,
                filter: [
                    'all',
                    ['!=', ['get', 'is_tunnel'], true],
                    ['match', ['get', 'kind'], ['highway', 'major_road', 'minor_road'], true, false]
                ],
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                    'line-color': '#05080f',
                    'line-opacity': 0.8,
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        10,
                        [
                            'match',
                            ['get', 'kind'],
                            'highway',
                            1.6,
                            'major_road',
                            1.1,
                            'minor_road',
                            0.4,
                            0
                        ],
                        11,
                        [
                            'match',
                            ['get', 'kind'],
                            'highway',
                            2.6,
                            'major_road',
                            1.8,
                            'minor_road',
                            0.8,
                            0
                        ],
                        12,
                        [
                            'match',
                            ['get', 'kind'],
                            'highway',
                            4.2,
                            'major_road',
                            2.8,
                            'minor_road',
                            1.2,
                            0
                        ],
                        13,
                        [
                            'match',
                            ['get', 'kind'],
                            'highway',
                            7,
                            'major_road',
                            4.6,
                            'minor_road',
                            2.2,
                            0
                        ]
                    ]
                }
            },
            {
                id: 'roads-fill',
                type: 'line',
                source: 'basemap',
                'source-layer': 'roads',
                minzoom: 10,
                filter: [
                    'all',
                    ['!=', ['get', 'is_tunnel'], true],
                    ['match', ['get', 'kind'], ['highway', 'major_road', 'minor_road'], true, false]
                ],
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'kind'],
                        'highway',
                        '#2b3648',
                        'major_road',
                        '#212b3b',
                        'minor_road',
                        '#18202e',
                        '#18202e'
                    ],
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        10,
                        [
                            'match',
                            ['get', 'kind'],
                            'highway',
                            1,
                            'major_road',
                            0.6,
                            'minor_road',
                            0.15,
                            0
                        ],
                        11,
                        [
                            'match',
                            ['get', 'kind'],
                            'highway',
                            1.8,
                            'major_road',
                            1.2,
                            'minor_road',
                            0.45,
                            0
                        ],
                        12,
                        [
                            'match',
                            ['get', 'kind'],
                            'highway',
                            3,
                            'major_road',
                            1.9,
                            'minor_road',
                            0.7,
                            0
                        ],
                        13,
                        [
                            'match',
                            ['get', 'kind'],
                            'highway',
                            5.4,
                            'major_road',
                            3.4,
                            'minor_road',
                            1.6,
                            0
                        ]
                    ]
                }
            },
            {
                id: 'buildings',
                type: 'fill',
                source: 'basemap',
                'source-layer': 'buildings',
                minzoom: 13,
                maxzoom: 14,
                paint: { 'fill-color': '#151c28', 'fill-opacity': 0.85 }
            }
        ]
    };
}
