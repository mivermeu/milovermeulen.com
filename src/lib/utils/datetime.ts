// Utilities for uniformly formatting datetimes.

export function month_plus_year(date: Date): string {
    return date.toLocaleDateString('default', {'month': 'short'}) + ' ' + date.getFullYear();
}