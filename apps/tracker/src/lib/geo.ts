/**
 * Pure degree-parsing helpers for manual observer-location entry.
 * Returns `null` for anything that is not a finite degree number in range.
 */
export function parseLatitude(text: string): number | null {
    const raw = trimNumeric(text);
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < -90 || value > 90) return null;
    return value;
}

export function parseLongitude(text: string): number | null {
    const raw = trimNumeric(text);
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < -180 || value > 180) return null;
    return value;
}

function trimNumeric(text: string): string | null {
    const raw = text.trim().replace(',', '.');
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return null;
    return raw;
}
