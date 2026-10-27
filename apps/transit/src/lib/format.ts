import type { FeedHealth, VehicleStatus } from './types';

/** Short labels for the nine MTA feeds, keyed by the service's feed names. */
const FEED_LABELS: Record<string, string> = {
    gtfs: '123',
    'gtfs-ace': 'ACE',
    'gtfs-bdfm': 'BDFM',
    'gtfs-g': 'G',
    'gtfs-jz': 'JZ',
    'gtfs-l': 'L',
    'gtfs-nqrw': 'NQRW',
    'gtfs-si': 'SI',
    'subway-alerts': 'alerts'
};

/** Numbers first (1–7), then lettered routes alphabetically. */
export function routeSortKey(route: string): string {
    return /^\d+$/.test(route) ? `0${route.padStart(3, '0')}` : `1${route}`;
}

export function sortRoutes(routes: Iterable<string>): string[] {
    return [...new Set(routes)].sort((a, b) => routeSortKey(a).localeCompare(routeSortKey(b)));
}

export function feedLabel(name: string): string {
    return FEED_LABELS[name] ?? name.replace(/^gtfs-/, '');
}

export function feedTone(feed: FeedHealth): 'ok' | 'warn' | 'bad' {
    if (!feed.ok) return 'bad';
    if (feed.age_s !== null && feed.age_s > 120) return 'warn';
    return 'ok';
}

export function statusLabel(status: VehicleStatus | null): string {
    switch (status) {
        case 'STOPPED_AT':
            return 'at platform';
        case 'IN_TRANSIT_TO':
            return 'in transit';
        case 'INCOMING_AT':
            return 'arriving';
        default:
            return 'unknown';
    }
}

/** "now" / "3 min" / "—" for an absolute unix timestamp. */
export function formatEta(arrival: number | null, nowSeconds: number = Date.now() / 1000): string {
    if (arrival === null || !Number.isFinite(arrival)) return '—';
    const minutes = Math.round((arrival - nowSeconds) / 60);
    if (minutes <= 0) return 'now';
    return `${minutes} min`;
}

/** Metres per second to a human speed; anything under walking pace is "stopped". */
export function formatSpeed(mps: number | null): string {
    if (mps === null || !Number.isFinite(mps) || mps < 0.5) return 'stopped';
    return `${Math.round(mps * 2.23694)} mph`;
}

export function formatAge(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds)) return 'unknown';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
}

export function formatConfidence(value: number): string {
    return `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`;
}
