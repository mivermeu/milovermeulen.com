export function csvEscape(v: unknown): string {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function parseCsvLine(line: string, delimiter: string): string[] {
    const fields: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else inQ = false;
            } else cur += ch;
        } else if (ch === '"') {
            inQ = true;
        } else if (ch === delimiter) {
            fields.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    fields.push(cur);
    return fields;
}

/** Parse CSV text into a JSON array of objects using `delimiter`; honor/hide header row with `hasHeader`. */
export function csvToJson(csv: string, delimiter: string, hasHeader: boolean): string {
    const lines = csv
        .trim()
        .split('\n')
        .map((l) => parseCsvLine(l, delimiter));
    if (lines.length < 1) return '';
    if (hasHeader && lines.length < 2) return '[]';
    const headers = hasHeader ? lines[0] : lines[0].map((_, i) => `col${i + 1}`);
    const rows = hasHeader ? lines.slice(1) : lines;
    return JSON.stringify(
        rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))),
        null,
        2
    );
}

/** Serialize a JSON array of objects into CSV text using `delimiter`. */
export function jsonToCsv(json: string, delimiter: string): string {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr) || arr.length === 0) return '';
    const headers = Object.keys(arr[0]);
    return [
        headers.join(delimiter),
        ...arr.map((row) => headers.map((h) => csvEscape(row[h])).join(delimiter))
    ].join('\n');
}
