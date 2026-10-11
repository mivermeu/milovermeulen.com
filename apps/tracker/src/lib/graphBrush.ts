/**
 * Brush-select for the orbital-parameter scatter (`SatelliteGraph`).
 *
 * The interaction is screen-space: the user drags a rectangle over the plot;
 * on release the rectangle is converted to DATA-space bounds for the current
 * x/y parameters and becomes a live filter. Pure logic lives here so it can be
 * unit tested without a canvas or three.js.
 *
 * Composition rules (deliberate decisions, see also the graph component):
 * - The brush composes with the tree filter as AND. The worker's
 *   positions/elements arrays stay indexed by the TREE-filtered set — brush
 *   filtering must never remove or reorder those rows, so consumers cull
 *   brushed-out points at render time (graph: park offscreen; globe: origin
 *   parking in GlobeScene) while keeping each point's array slot.
 * - Axis ranges deliberately keep scanning ALL tree-active samples (not the
 *   brush-composed set), so committing a brush never rescales the axes and the
 *   drawn region's meaning stays stable while satellites glide.
 * - Switching xKey/yKey invalidates the brush: a region drawn in one parameter
 *   space is meaningless in another, so it is cleared rather than re-evaluated.
 */

export interface GraphBrush {
    xKey: string;
    /** Data-space bounds of the brushed region (min/max sorted). */
    xMin: number;
    xMax: number;
    yKey: string;
    yMin: number;
    yMax: number;
}

/** Drag distance before a pointer sequence counts as a brush instead of a click. */
export const BRUSH_DRAG_THRESHOLD_PX = 6;
/** Committed rects thinner than this (per axis, after clamping) clear the brush. */
export const BRUSH_MIN_AXIS_PX = 6;

/** Canvas-local screen rectangle, any corner order. */
export interface ScreenRect {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
}

/** The graph's plot rect in canvas-local px (mirrors `plot` in the component). */
export interface PlotRect {
    l: number;
    t: number;
    w: number;
    h: number;
}

export interface BrushAxes {
    xKey: string;
    yKey: string;
    plot: PlotRect;
    xRange: [number, number];
    yRange: [number, number];
    xLog: boolean;
    yLog: boolean;
}

/** Min/max-normalize a drag rect from two corner points. */
export function normalizedRect(x0: number, y0: number, x1: number, y1: number): ScreenRect {
    return {
        x0: Math.min(x0, x1),
        x1: Math.max(x0, x1),
        y0: Math.min(y0, y1),
        y1: Math.max(y0, y1)
    };
}

/**
 * Chebyshev distance test: a straight horizontal or vertical drag is a
 * legitimate band brush, so only the larger extent must pass the threshold.
 */
export function dragPassedThreshold(x0: number, y0: number, x1: number, y1: number): boolean {
    return Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) >= BRUSH_DRAG_THRESHOLD_PX;
}

/** Inverse of the graph's linear norm: canvas-local px → data value, clamped to the axis. */
export function canvasXToData(
    px: number,
    plot: PlotRect,
    range: [number, number],
    log: boolean
): number {
    const t = clamp01((px - plot.l) / plot.w);
    return invNorm(t, range, log);
}

/** Inverse linear norm for the y axis (screen py grows downward). */
export function canvasYToData(
    py: number,
    plot: PlotRect,
    range: [number, number],
    log: boolean
): number {
    const t = clamp01((plot.t + plot.h - py) / plot.h);
    return invNorm(t, range, log);
}

function clamp01(t: number): number {
    return Math.min(1, Math.max(0, t));
}

function invNorm(t: number, range: [number, number], log: boolean): number {
    if (log) {
        const l0 = Math.log10(range[0]);
        const l1 = Math.log10(range[1]);
        return 10 ** (l0 + t * (l1 - l0));
    }
    return range[0] + t * (range[1] - range[0]);
}

/**
 * Secondary-axis hairline floor. The dominant axis of a passed-threshold drag
 * always commits (band brushes are legitimate); the other axis only needs this
 * small extent so deliberate thin bands work while 1px scratches and
 * below-threshold blobs still clear.
 */
export const BRUSH_SECONDARY_MIN_PX = 2;

/**
 * Convert a committed screen rect to a data-space brush. Returns null when the
 * rect is too tiny to be a meaningful selection — the caller treats null as
 * "clear the brush" (empty/tiny drag clears). A band brush commits when the
 * dominant axis reaches BRUSH_MIN_AXIS_PX and the secondary axis at least
 * BRUSH_SECONDARY_MIN_PX (the dominant axis carries the selection; no
 * full-height floor is imposed on the secondary one).
 */
export function brushFromCanvasRect(rect: ScreenRect, axes: BrushAxes): GraphBrush | null {
    const { plot } = axes;
    // The component clamps the live rect to the plot while dragging, and the
    // canvasX/YToData conversions clamp fractionally anyway — no rect clamp here.
    const xExt = rect.x1 - rect.x0;
    const yExt = rect.y1 - rect.y0;
    if (Math.max(xExt, yExt) < BRUSH_MIN_AXIS_PX) return null;
    if (Math.min(xExt, yExt) < BRUSH_SECONDARY_MIN_PX) return null;
    const xMin = canvasXToData(rect.x0, plot, axes.xRange, axes.xLog);
    const xMax = canvasXToData(rect.x1, plot, axes.xRange, axes.xLog);
    const yMin = canvasYToData(rect.y1, plot, axes.yRange, axes.yLog); // bottom edge = smaller value
    const yMax = canvasYToData(rect.y0, plot, axes.yRange, axes.yLog); // top edge = larger value
    if (
        !Number.isFinite(xMin) ||
        !Number.isFinite(xMax) ||
        !Number.isFinite(yMin) ||
        !Number.isFinite(yMax)
    ) {
        return null;
    }
    return { xKey: axes.xKey, xMin, xMax, yKey: axes.yKey, yMin, yMax };
}

/** A brush only filters while the same x/y parameters are still selected. */
export function brushIsActiveForAxes(
    brush: GraphBrush | null,
    xKey: string,
    yKey: string
): boolean {
    return brush !== null && brush.xKey === xKey && brush.yKey === yKey;
}

/**
 * Region membership test. Inclusive bounds; non-finite values (failed
 * propagation rows) are never inside. Mismatched axes → false (an axis-stale
 * brush must not filter anything).
 */
export function pointInBrush(
    brush: GraphBrush | null,
    xKey: string,
    yKey: string,
    xv: number,
    yv: number
): boolean {
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) return false;
    if (!brush || brush.xKey !== xKey || brush.yKey !== yKey) return false;
    return xv >= brush.xMin && xv <= brush.xMax && yv >= brush.yMin && yv <= brush.yMax;
}

/**
 * Compose the brush with an upstream (tree) filter. `samples` are already the
 * tree-filtered, order-stable set; each sample owns its worker-array slot as
 * `uIndex`. The returned flags are indexed by ARRAY POSITION (== worker slot,
 * == globe position slot): 1 = inside the brush (visible), 0 = culled.
 * Returns null when no brush applies to the current axes or when every sample
 * is inside (nothing to cull) so consumers can skip the work entirely.
 */
export function computeBrushMask<T extends { uIndex: number }>(
    brush: GraphBrush | null,
    xKey: string,
    yKey: string,
    samples: readonly T[],
    valueOf: (sample: T) => { x: number; y: number }
): Uint8Array | null {
    if (!brushIsActiveForAxes(brush, xKey, yKey)) return null;
    const b = brush;
    let all = true;
    const flags = new Uint8Array(samples.length);
    for (let k = 0; k < samples.length; k++) {
        const v = valueOf(samples[k]);
        if (pointInBrush(b, xKey, yKey, v.x, v.y)) flags[k] = 1;
        else all = false;
    }
    return all ? null : flags;
}

/**
 * Axis-change invalidation policy: a brush drawn in one parameter space is
 * meaningless in another, so changing xKey or yKey CLEARS it. Returns the
 * brush unchanged (same reference) when the axes still match so a no-op clear
 * never reassigns state.
 */
export function invalidateBrushOnAxisChange(
    brush: GraphBrush | null,
    xKey: string,
    yKey: string
): GraphBrush | null {
    if (!brush) return null;
    return brushIsActiveForAxes(brush, xKey, yKey) ? brush : null;
}

/**
 * Chip text for the active brush, e.g. `i 51.0–60.0 × peri 500–600`.
 * Returns null when there is no brush to show.
 */
export function brushChipText(
    brush: GraphBrush | null,
    short: (key: string) => string,
    format: (key: string, value: number) => string
): string | null {
    if (!brush) return null;
    const x = `${short(brush.xKey)} ${format(brush.xKey, brush.xMin)}–${format(brush.xKey, brush.xMax)}`;
    const y = `${short(brush.yKey)} ${format(brush.yKey, brush.yMin)}–${format(brush.yKey, brush.yMax)}`;
    return `${x} × ${y}`;
}
