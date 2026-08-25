export function parseField(field: string, min: number, max: number): number[] {
    if (field === '*') return Array.from({ length: max - min + 1 }, (_, i) => i + min);
    const values: number[] = [];
    for (const part of field.split(',')) {
        if (part.includes('/')) {
            const [range, step] = part.split('/');
            const [lo, hi] = range === '*' ? [min, max] : range.split('-').map(Number);
            for (let i = lo; i <= hi; i += Number(step)) values.push(i);
        } else if (part.includes('-')) {
            const [lo, hi] = part.split('-').map(Number);
            for (let i = lo; i <= hi; i++) values.push(i);
        } else {
            values.push(Number(part));
        }
    }
    return values.filter((v, i) => v >= min && v <= max && values.indexOf(v) === i);
}

export function describeCron(parts: string[]): string {
    if (parts.length < 5) return 'Invalid: need 5 fields';
    const names = ['minute', 'hour', 'day of month', 'month', 'day of week'];
    return parts
        .map((p, i) => {
            if (p === '*') return `every ${names[i]}`;
            if (p.includes('/')) return `every ${p.split('/')[1]} ${names[i]}s`;
            if (p.includes(',')) return `${names[i]}s ${p}`;
            return `${names[i]} ${p}`;
        })
        .join(', ');
}