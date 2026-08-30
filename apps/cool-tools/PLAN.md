# Cool Tools — Implementation Plan

## Overview

A new SvelteKit app at `/cool-tools` containing 16 free, client-side utilities. No backend, no
sign-up, no tracking. All tools run entirely in the browser using native APIs and lightweight JS
libraries.

## Tech Stack

- **Framework**: SvelteKit with Svelte 5 (runes mode)
- **Styling**: Tailwind CSS v4 via `shared-config`
- **Adapter**: `@sveltejs/adapter-static` (prerendered)
- **Port**: 5175 (dev)
- **Base path**: `/cool-tools`

## Dependencies (only 3)

| Package  | Size   | Used by           |
| -------- | ------ | ----------------- |
| `qrcode` | ~135KB | QR Code Generator |
| `marked` | ~50KB  | Markdown Editor   |
| `diff`   | ~30KB  | Text Diff Viewer  |

Everything else uses native APIs (`crypto.subtle`, `crypto.randomUUID`, `btoa`/`atob`, `File`,
Canvas).

## Tools (16)

### 1. Settle Up — Expense Splitter

- Add people and expenses (who paid, how much, for whom)
- Compute minimum-transfers using greedy debt simplification algorithm
- localStorage persistence
- Export/import data as JSON
- **Complexity**: high
- **Deps**: none

### 2. QR Code Generator

- Text/URL input → QR code rendered as canvas/SVG
- Download as PNG or SVG
- Configurable size, error correction level
- **Complexity**: medium
- **Deps**: `qrcode`

### 3. JSON Formatter / Validator

- Paste JSON → formatted output with indentation
- Validation with error messages (line/column)
- Collapsible tree view (optional, add later)
- **Complexity**: low
- **Deps**: none (native `JSON.parse`/`JSON.stringify`)

### 4. Regex Tester

- Input regex pattern + flags
- Test string with live match highlighting
- Show match groups
- **Complexity**: medium
- **Deps**: none (native `RegExp`)

### 5. Color Palette Generator

- Input hex/RGB/HSL → convert between formats
- Generate complementary, analogous, triadic, split-complementary palettes
- Copy individual colors
- **Complexity**: medium
- **Deps**: none (HSL math)

### 6. Password Generator

- Configurable length, character sets (uppercase, lowercase, digits, symbols)
- Cryptographically secure via `crypto.getRandomValues()`
- Copy button, strength indicator
- **Complexity**: low
- **Deps**: none

### 7. Markdown Editor

- Split-pane: editor left, preview right
- Live rendering via `marked`
- **Complexity**: medium
- **Deps**: `marked`

### 8. Base64 Encoder / Decoder

- Text input → Base64 and vice versa
- File support (read as ArrayBuffer, encode)
- Handle UTF-8 properly (`TextEncoder`/`TextDecoder`)
- **Complexity**: low
- **Deps**: none

### 9. UUID Generator

- Generate v4 UUIDs via `crypto.randomUUID()`
- Batch generate (1–100)
- Copy individual or all
- **Complexity**: low
- **Deps**: none

### 10. JWT Decoder

- Paste JWT → split into header, payload, signature
- Base64url-decode and pretty-print JSON
- Show expiry, issued-at if present
- **Complexity**: low
- **Deps**: none

### 11. Cron Expression Visualizer

- Input cron string (5 or 6 fields)
- Show human-readable description
- List next N execution times
- **Complexity**: medium
- **Deps**: `cron-parser`

### 12. Text Diff Viewer

- Two text areas (left/right)
- Side-by-side diff with line-level highlighting
- Additions in green, deletions in red
- **Complexity**: medium
- **Deps**: `diff`

### 13. Hash Generator

- Text or file input
- Output SHA-256, SHA-1, SHA-512, MD5
- Uses `crypto.subtle.digest()` (native)
- **Complexity**: low
- **Deps**: none

### 14. CSV ↔ JSON Converter

- Paste CSV → JSON array of objects
- Paste JSON array → CSV
- Configurable delimiter, header row toggle
- **Complexity**: medium
- **Deps**: none (simple parser)

### 15. CSS Gradient Generator

- Visual editor with draggable color stops
- Angle control for linear gradients
- Radial gradient support
- Live preview, one-click copy of CSS
- **Complexity**: medium
- **Deps**: none

### 16. WCAG Contrast Checker

- Pick foreground and background colors
- Show contrast ratio
- AA/AAA pass/fail for normal and large text
- **Complexity**: low
- **Deps**: none (relative luminance formula)

## Architecture

```
apps/cool-tools/
├── package.json
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── PLAN.md                  ← this file
└── src/
    ├── app.css
    ├── app.d.ts
    ├── app.html
    └── routes/
        ├── +layout.svelte   ← sidebar nav + tool content
        ├── +layout.ts       ← prerender = true, ssr = false
        ├── +page.svelte     ← landing page with tool grid
        └── tools/
            ├── settle-up/+page.svelte
            ├── qr-code/+page.svelte
            ├── json-formatter/+page.svelte
            ├── regex-tester/+page.svelte
            ├── color-palette/+page.svelte
            ├── password-generator/+page.svelte
            ├── markdown-editor/+page.svelte
            ├── base64/+page.svelte
            ├── uuid/+page.svelte
            ├── jwt-decoder/+page.svelte
            ├── cron-visualizer/+page.svelte
            ├── diff/+page.svelte
            ├── hash-generator/+page.svelte
            ├── csv-json/+page.svelte
            ├── gradient-generator/+page.svelte
            └── contrast-checker/+page.svelte
```

Each tool is a self-contained `+page.svelte`. No shared `src/lib/` initially — extract shared
components (copy button, textarea wrapper) only when 3+ tools duplicate the same UI pattern.

## Layout

- `+layout.svelte` renders a sidebar with tool list + main content area
- Responsive: sidebar collapses to hamburger menu on mobile
- Landing page (`+page.svelte`) shows a grid of tool cards with names and descriptions

## Implementation Order

1. **Scaffold** — config files, package.json, app.css, layout, landing page ← DONE
2. **Layout** — sidebar navigation, responsive design, tool cards on landing page
3. **Simple tools** (low complexity):
    - UUID Generator → Password Generator → Base64 → Hash Generator → JWT Decoder
4. **Medium tools**:
    - JSON Formatter → Regex Tester → Color Palette → Contrast Checker → CSV↔JSON → Cron Visualizer
      → CSS Gradient Generator
5. **Complex tools**:
    - QR Code Generator → Markdown Editor → Text Diff Viewer → Settle Up
6. **Polish** — consistent UI, copy buttons, responsive layout

## Design Decisions

- **No backend**: All tools are pure client-side. Settle Up uses localStorage for persistence.
- **No shared lib initially**: Each tool is a single page. Extract only when duplication appears.
- **Sidebar layout**: `+layout.svelte` renders sidebar + content. Responsive hamburger on mobile.
- **Landing page**: Grid of tool cards, not a blank page.
- **Consistent UI**: Each tool follows the same pattern: title, description, input area, action
  button, output area. Uses shared-config theme tokens.

## Skipped (add when needed)

- **Link shortener**: Needs a backend. Dropped.
- **Image compression**: Heavier scope. Add later.
- **Shared component library**: Extract only when 3+ tools duplicate the same UI.
- **Search/filter on landing page**: Add when tools exceed ~20.
