import type { DataSource } from '$lib/satellites/types';

export function sourceLabel(source: DataSource): string {
    switch (source) {
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
