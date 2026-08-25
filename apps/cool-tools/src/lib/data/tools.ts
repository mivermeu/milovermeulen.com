export type ToolSlug =
    | 'settle-up'
    | 'qr-code'
    | 'uuid'
    | 'password-generator'
    | 'hash-generator'
    | 'markdown-editor'
    | 'diff'
    | 'regex-tester'
    | 'base64'
    | 'csv-json'
    | 'json-formatter'
    | 'jwt-decoder'
    | 'color-palette'
    | 'gradient-generator'
    | 'contrast-checker'
    | 'cron-visualizer';

export interface Tool {
    slug: ToolSlug;
    name: string;
    desc: string;
}

export interface ToolCategory {
    name: string;
    tools: Tool[];
}

export const categories: ToolCategory[] = [
    {
        name: 'Money',
        tools: [{ slug: 'settle-up', name: 'Settle Up', desc: 'Split expenses and minimize transfers' }]
    },
    {
        name: 'Generators',
        tools: [
            { slug: 'qr-code', name: 'QR Code Generator', desc: 'Generate QR codes from text or URLs' },
            { slug: 'uuid', name: 'UUID Generator', desc: 'Generate v4 UUIDs' },
            { slug: 'password-generator', name: 'Password Generator', desc: 'Generate cryptographically secure passwords' },
            { slug: 'hash-generator', name: 'Hash Generator', desc: 'Generate SHA-256, MD5, and other hashes' }
        ]
    },
    {
        name: 'Text',
        tools: [
            { slug: 'markdown-editor', name: 'Markdown Editor', desc: 'Write markdown with live preview' },
            { slug: 'diff', name: 'Text Diff', desc: 'Compare two texts side by side' },
            { slug: 'regex-tester', name: 'Regex Tester', desc: 'Test regular expressions with live matching' }
        ]
    },
    {
        name: 'Converters',
        tools: [
            { slug: 'base64', name: 'Base64 Encoder', desc: 'Encode and decode Base64 text and files' },
            { slug: 'csv-json', name: 'CSV ↔ JSON', desc: 'Convert between CSV and JSON formats' },
            { slug: 'json-formatter', name: 'JSON Formatter', desc: 'Format, validate, and explore JSON' },
            { slug: 'jwt-decoder', name: 'JWT Decoder', desc: 'Decode and inspect JSON Web Tokens' }
        ]
    },
    {
        name: 'Design',
        tools: [
            { slug: 'color-palette', name: 'Color Palette', desc: 'Generate color palettes and convert formats' },
            { slug: 'gradient-generator', name: 'CSS Gradient', desc: 'Visual CSS gradient editor' },
            { slug: 'contrast-checker', name: 'Contrast Checker', desc: 'Check WCAG color contrast ratios' }
        ]
    },
    {
        name: 'Scheduling',
        tools: [{ slug: 'cron-visualizer', name: 'Cron Visualizer', desc: 'Parse cron expressions and see schedules' }]
    }
];