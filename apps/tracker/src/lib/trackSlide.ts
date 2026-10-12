/**
 * Per-frame sliding of baked track polylines, decoupled from worker rebuilds.
 *
 * Track geometry (orbit chains, ground tracks) is sampled by the worker on a
 * cadence and anchored at the request epoch; between rebuilds the drawn window
 * must not fall behind the moving dot at high time accelerations. The helpers
 * here find a window's vertices inside a baked chain by TIME and write its
 * edges per frame from the satellite's live position to exactly one period
 * ahead. The worker keeps the bookkeeping: bakes span two periods so a window
 * starting up to a rebuild interval late still has a full period of material
 * ahead of it.
 */

/**
 * One satellite's baked orbit chain: flat 3-float vertices, monotone
 * non-decreasing time offsets (ms) per vertex, its orbital period. Orbit
 * chains are ν-sampled (vertex times non-uniform); ground tracks are
 * time-uniform. Either way the window search is by time.
 */
export interface BakedChain {
    positions: Float32Array;
    times: Float32Array;
    vertexCount: number;
    periodMs: number;
}

/**
 * Index (0-based within the chain) of the FIRST vertex whose time offset is at
 * or after `target`. Chains hold monotone non-decreasing time offsets (ms) —
 * the doubled ν-grid bake repeats each period, so a window start found here
 * always has a full period of material ahead of it without wrapping.
 *
 * Returns −1 when no vertex qualifies (the render epoch is beyond the whole
 * bake — the caller falls back to the freshest period or holds its frame).
 */
export function firstVertexAtOrAfter(
    times: Float32Array,
    offset: number,
    count: number,
    target: number
): number {
    if (count <= 0 || offset + count > times.length) return -1;
    let lo = offset;
    let hi = offset + count - 1;
    if (times[hi] < target) return -1;
    if (times[lo] >= target) return 0;
    // Half-open search: invariant times[lo−1] < target ≤ times[hi].
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < target) lo = mid + 1;
        else hi = mid;
    }
    return lo - offset;
}

/**
 * Write one satellite's visible window — the chain's vertices in the time
 * range `[target, target + period]` — into a fixed edge-slot as explicit
 * duplicated-endpoint LineSegments edges (no adjacency assumptions anywhere).
 *
 * - The head is the exact live world position `anchor` (chain-relative target
 *   must be ≥ 0 — pass a null anchor for earlier targets, where the bake has
 *   no material behind its start).
 * - The tail is a lerp vertex at exactly `target + period` between the
 *   bracketing chain vertices, so the window end glides continuously at any
 *   speed instead of hopping between time-sparsed vertices.
 * - The slot's unused tail is zero-padded (degenerate pairs render as
 *   nothing), so no draw range or per-frame reallocation is needed.
 * - The chain must be a single contiguous run (fragmented chains don't slide).
 *
 * Returns the number of edges written (≤ maxEdges); 0 means "hold nothing new"
 * (stale target or degenerate window).
 */
export function writeWindowEdges(
    positions: Float32Array,
    times: Float32Array,
    vertexOffset: number,
    vertexCount: number,
    periodMs: number,
    anchor: readonly [number, number, number] | null,
    target: number,
    out: Float32Array,
    outBase: number,
    maxEdges: number
): number {
    const vx = (k: number) => positions[(vertexOffset + k) * 3];
    const vy = (k: number) => positions[(vertexOffset + k) * 3 + 1];
    const vz = (k: number) => positions[(vertexOffset + k) * 3 + 2];
    let n = 0; // edges written
    const put = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): void => {
        if (n >= maxEdges) return;
        const w = outBase + n * 6;
        out[w] = ax;
        out[w + 1] = ay;
        out[w + 2] = az;
        out[w + 3] = bx;
        out[w + 4] = by;
        out[w + 5] = bz;
        n++;
    };

    const head = firstVertexAtOrAfter(times, vertexOffset, vertexCount, target);
    if (head < 0) {
        // The render epoch ran past the whole bake: nothing to draw this frame.
        out.fill(0, outBase, outBase + maxEdges * 6);
        return 0;
    }
    const endIdx = firstVertexAtOrAfter(times, vertexOffset, vertexCount, target + periodMs);
    if (endIdx === head) {
        out.fill(0, outBase, outBase + maxEdges * 6);
        return 0;
    }
    const endLimit = endIdx < 0 ? vertexCount : endIdx; // exclusive vertex

    if (anchor) {
        put(anchor[0], anchor[1], anchor[2], vx(head), vy(head), vz(head));
    }
    for (let k = head; k + 1 < endLimit; k++) {
        put(vx(k), vy(k), vz(k), vx(k + 1), vy(k + 1), vz(k + 1));
    }
    if (endLimit < vertexCount) {
        const tA = times[vertexOffset + endLimit - 1];
        const tB = times[vertexOffset + endLimit];
        const span = tB - tA;
        const alpha = span > 0 ? Math.min(1, Math.max(0, (target + periodMs - tA) / span)) : 0;
        if (alpha > 0) {
            put(
                vx(endLimit - 1),
                vy(endLimit - 1),
                vz(endLimit - 1),
                vx(endLimit - 1) + (vx(endLimit) - vx(endLimit - 1)) * alpha,
                vy(endLimit - 1) + (vy(endLimit) - vy(endLimit - 1)) * alpha,
                vz(endLimit - 1) + (vz(endLimit) - vz(endLimit - 1)) * alpha
            );
        }
    }
    out.fill(0, outBase + n * 6, outBase + maxEdges * 6);
    return n;
}
