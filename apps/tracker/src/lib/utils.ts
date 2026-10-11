import type { DataSource } from '$lib/satellites/types';

// Magnitude of an ECI position/velocity triple from satellite.js (km or km/s).
export function eciSpeedKms(v: { x: number; y: number; z: number }): number {
    return Math.hypot(v.x, v.y, v.z);
}

export function sourceLabel(source: DataSource): string {
    switch (source) {
        case 'local-api':
            return 'Local API';
        case 'celestrak':
            return 'CelesTrak (live)';
        case 'sample':
            return 'Bundled sample';
        case 'error':
            return 'No data';
        case 'loading':
            return 'Loading\u2026';
    }
}
