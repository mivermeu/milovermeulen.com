import { browser } from '$app/environment';
import { loadCatalog } from '$lib/satellites/tle';
import type { DataSource, ParsedSatellite } from '$lib/satellites/types';

export const SPEED_OPTIONS = [
    { label: 'Pause', value: 0 },
    { label: '1\u00d7', value: 1 },
    { label: '5\u00d7', value: 5 },
    { label: '15\u00d7', value: 15 },
    { label: '60\u00d7', value: 60 }
] as const;

export const trackerState = $state({
    satellites: [] as ParsedSatellite[],
    showOrbits: true,
    speed: 1,
    renderedCount: 0,
    dataSource: 'loading' as DataSource,
    error: '',
    simDateTime: '',
    setSimTime: null as ((ms: number) => void) | null,
    referenceFrame: 'ecf' as 'ecf' | 'eci'
});

if (browser) {
    loadCatalog().then(({ satellites, source, error }) => {
        trackerState.satellites = satellites;
        trackerState.dataSource = source;
        trackerState.error = error ?? '';
    });
}