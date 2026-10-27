import './maplibre-worker';

import type { Feature, FeatureCollection, LineString, Point, Position } from 'geojson';
import * as maplibregl from 'maplibre-gl';
import { routeColor } from './palette';
import type { Graph, PatternGeometry, TrainPosition } from './types';

export type NetworkProperties = {
    id: string;
    route: string;
    color: string;
};

export type StationProperties = {
    id: string;
    name: string;
};

export type TrainProperties = {
    id: string;
    route: string | null;
    color: string;
    stale: boolean;
    reset: boolean;
    confidence: number;
    positioned: boolean;
};

const NETWORK_SOURCE = 'network';
const NETWORK_LAYER = 'network-lines';
const STATIONS_SOURCE = 'stations';
const STATIONS_LAYER = 'stations-dots';
const TRAINS_SOURCE = 'trains';
const TRAINS_LAYER = 'trains-dots';

const NYC_CENTER: [number, number] = [-73.98, 40.73];

/** The five boroughs with a little breathing room; there is nothing to see outside. */
const NYC_BOUNDS: [[number, number], [number, number]] = [
    [-74.35, 40.45],
    [-73.55, 41.0]
];

/**
 * Create the map: a blank style (no tiles in v1) over the NYC area, with every
 * rotation gesture turned off so the view can only pan and zoom.
 */
export function createMap(container: HTMLElement): maplibregl.Map {
    const map = new maplibregl.Map({
        container,
        style: { version: 8, sources: {}, layers: [] },
        center: NYC_CENTER,
        zoom: 10.5,
        minZoom: 9,
        maxZoom: 16,
        maxBounds: NYC_BOUNDS,
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: false,
        renderWorldCopies: false
    });

    // `dragRotate: false` does not cover pinch and keyboard rotation.
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    return map;
}

/**
 * One LineString per pattern, coloured by route. The shape buffer is lat/lon
 * pairs; MapLibre wants [lng, lat], so the axes are swapped here.
 */
export function networkGeoJSON(
    graph: Graph,
    geometries: Map<string, PatternGeometry>
): FeatureCollection<LineString, NetworkProperties> {
    const features: Feature<LineString, NetworkProperties>[] = [];

    for (const pattern of graph.patterns) {
        const geometry = geometries.get(pattern.id);
        if (!geometry || geometry.line.length < 4) {
            continue;
        }

        features.push({
            type: 'Feature',
            id: pattern.id,
            geometry: { type: 'LineString', coordinates: lngLatPairs(geometry.line) },
            properties: {
                id: pattern.id,
                route: pattern.route,
                color: routeColor(pattern.route)
            }
        });
    }

    return { type: 'FeatureCollection', features };
}

/** One Point per station, named so the UI can label them later. */
export function stationsGeoJSON(graph: Graph): FeatureCollection<Point, StationProperties> {
    return {
        type: 'FeatureCollection',
        features: graph.stations.map((station) => ({
            type: 'Feature',
            id: station.id,
            geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
            properties: { id: station.id, name: station.name }
        }))
    };
}

/**
 * Install the network, station and train sources/layers. Call once on
 * `map.on('load')`; repeat calls are a no-op.
 */
export function installLayers(
    map: maplibregl.Map,
    graph: Graph,
    geometries: Map<string, PatternGeometry>
): void {
    if (map.getSource(NETWORK_SOURCE)) {
        return;
    }

    map.addSource(NETWORK_SOURCE, {
        type: 'geojson',
        data: networkGeoJSON(graph, geometries)
    });
    map.addLayer({
        id: NETWORK_LAYER,
        type: 'line',
        source: NETWORK_SOURCE,
        layout: {
            'line-cap': 'round',
            'line-join': 'round'
        },
        paint: {
            'line-color': ['get', 'color'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 11, 1.5, 13, 2.5, 15, 4],
            'line-opacity': 0.9
        }
    });

    map.addSource(STATIONS_SOURCE, {
        type: 'geojson',
        data: stationsGeoJSON(graph)
    });
    map.addLayer({
        id: STATIONS_LAYER,
        type: 'circle',
        source: STATIONS_SOURCE,
        minzoom: 11.5,
        paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 11.5, 1.5, 15, 3.5],
            'circle-color': '#cbd5e1',
            'circle-stroke-color': '#0f172a',
            'circle-stroke-width': 1
        }
    });

    map.addSource(TRAINS_SOURCE, {
        type: 'geojson',
        data: trainGeoJSON([])
    });
    map.addLayer({
        id: TRAINS_LAYER,
        type: 'circle',
        source: TRAINS_SOURCE,
        filter: ['==', ['get', 'positioned'], true],
        paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 12, 4, 15, 5],
            'circle-color': ['get', 'color'],
            'circle-opacity': ['case', ['get', 'reset'], 0.3, ['get', 'stale'], 0.55, 1],
            'circle-stroke-color': '#0f172a',
            'circle-stroke-width': ['case', ['get', 'reset'], 0, 1],
            'circle-stroke-opacity': ['case', ['get', 'reset'], 0, ['get', 'stale'], 0.5, 1]
        }
    });
}

/**
 * Replace the network and station geometry after a weekly graph rebuild.
 * Cheaper than recreating the map, and keeps the camera where the user left it.
 */
export function updateNetwork(
    map: maplibregl.Map,
    graph: Graph,
    geometries: Map<string, PatternGeometry>
): void {
    const network = map.getSource(NETWORK_SOURCE) as maplibregl.GeoJSONSource | undefined;
    network?.setData(networkGeoJSON(graph, geometries));
    const stations = map.getSource(STATIONS_SOURCE) as maplibregl.GeoJSONSource | undefined;
    stations?.setData(stationsGeoJSON(graph));
}

/** Positioned trains as points; unpositioned trips are filtered out at render. */
export function trainGeoJSON(
    positions: TrainPosition[]
): FeatureCollection<Point, TrainProperties> {
    return {
        type: 'FeatureCollection',
        features: positions.map((train) => ({
            type: 'Feature',
            id: train.id,
            geometry: { type: 'Point', coordinates: [train.lng, train.lat] },
            properties: {
                id: train.id,
                route: train.route,
                color: train.routeColor,
                stale: train.stale,
                reset: train.reset,
                confidence: train.confidence,
                positioned: train.positioned
            }
        }))
    };
}

/**
 * Push new positions into the existing train source. Runs every animation frame,
 * so it must not add layers or sources; before the style loads there is no
 * source yet and the call is dropped.
 */
export function paintTrains(map: maplibregl.Map, positions: TrainPosition[]): void {
    const source = map.getSource(TRAINS_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source || typeof source.setData !== 'function') {
        return;
    }

    source.setData(trainGeoJSON(positions));
}

/** Convert a flat lat/lon buffer into MapLibre's [lng, lat] pairs. */
function lngLatPairs(buffer: Float32Array): Position[] {
    const pairs: Position[] = [];
    for (let i = 0; i + 1 < buffer.length; i += 2) {
        pairs.push([buffer[i + 1], buffer[i]]);
    }
    return pairs;
}
