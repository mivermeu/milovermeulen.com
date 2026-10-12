/**
 * Per-frame sliding of baked track polylines, decoupled from worker rebuilds.
 *
 * Track geometry (orbit ellipses, ground tracks) is sampled by the worker on a
 * cadence and anchored at the request epoch; between rebuilds the drawn window
 * must not fall behind the moving dot at high time accelerations. These pure
 * helpers rebuild the *visible* window per frame against the baked samples —
 * the view passes the satellite's current (live-blended) position as the
 * anchor, so the track always starts at the satellite and runs a full period
 * ahead. The worker keeps the bookkeeping: the ground track is baked over two
 * periods so a window starting up to a rebuild-interval late still has a full
 * orbit of material ahead of it.
 */

/**
 * A master polyline in LineSegments form: flat coordinate triplets, ND pairs,
 * where pair j occupies [j·6 … j·6+6) and holds (vⱼ, vⱼ₊₁) for a contiguous
 * chain. Vertex k of a contiguous chain lives at sample offset k·6.
 */

/** True when every pair `j+1` continues pair `j` (no SGP4-failure gap). */
export function isContiguousPairs(sub: Float32Array, eps = 1e-3): boolean {
    const pairs = sub.length / 6;
    for (let j = 0; j + 1 < pairs; j++) {
        const dx = sub[(j + 1) * 6] - sub[j * 6 + 3];
        const dy = sub[(j + 1) * 6 + 1] - sub[j * 6 + 4];
        const dz = sub[(j + 1) * 6 + 2] - sub[j * 6 + 5];
        if (dx * dx + dy * dy + dz * dz > eps * eps) return false;
    }
    return true;
}

/**
 * Re-anchor a time-uniform master window so that it starts at `headFrac` of the
 * window period. `headFrac` is (render epoch − master epoch) / master step
 * period, in [0, 1); the drawn window covers [headFrac, headFrac + 1] of the
 * master's second half — `windowSteps` samples after the anchor, so the worker
 * must have baked span ≥ 2 × window. The first vertex is the exact `anchor`
 * (the satellite's live subpoint); later vertices come straight from the
 * master's uniform time grid.
 *
 * Returns the number of pairs written, or −1 when the window would run past
 * the baked span (a badly overdue rebuild — the caller keeps the last frame).
 * `out` must hold windowSteps pairs (windowSteps × 6 floats).
 */
export function slideUniformWindow(
    master: Float32Array,
    headFrac: number,
    windowSteps: number,
    anchor: readonly [number, number, number],
    out: Float32Array
): number {
    const masterPairs = master.length / 6;
    const masterVertices = masterPairs + 1;
    const head = headFrac * windowSteps;
    const first = Math.floor(head);
    if (!Number.isFinite(headFrac) || headFrac < 0) return -1;
    if (windowSteps < 1 || out.length !== windowSteps * 6) return -1;
    if (first + windowSteps > masterVertices - 1) return -1;

    let w = 0;
    for (let j = 0; j < windowSteps; j++) {
        const a = j === 0 ? anchor : masterVertex(master, first + j);
        const b = masterVertex(master, first + j + 1);
        out[w++] = a[0];
        out[w++] = a[1];
        out[w++] = a[2];
        out[w++] = b[0];
        out[w++] = b[1];
        out[w++] = b[2];
    }
    return windowSteps;
}

function masterVertex(master: Float32Array, i: number) {
    return master.subarray(i * 6, i * 6 + 3);
}

/**
 * Index (0-based within the chain) of the FIRST vertex whose time offset is at
 * or after `target`. Chains hold monotone non-decreasing time offsets (ms) —
 * the doubled ν-grid bake repeats each period, so a window start found here
 * always has a full period of material ahead of it without wrapping. The view
 * draws its window from the anchor to `head − 1 chain vertices` later.
 *
 * Returns −1 when no vertex qualifies (the render epoch is beyond the whole
 * bake — the caller holds its last frame).
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
