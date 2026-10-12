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
 * Re-anchor a contiguous pair-chain so its drawn window starts and closes at
 * `anchor` (the satellite's current position). The head vertex is the master
 * vertex nearest the anchor; the incoming buffer keeps its pair count, with
 * the exact anchor interpolated in as vertex 0 and reused as the closing
 * vertex — the drawn result remains one full revolution starting from the sat.
 *
 * Returns the head vertex index (−1 when the slice is too short or the anchor
 * isn't near any vertex — the caller should keep the previous frame).
 */
export function rotateTrackToAnchor(
    sub: Float32Array,
    anchor: readonly [number, number, number],
    out: Float32Array
): number {
    const pairs = sub.length / 6;
    const vertices = pairs + 1;
    if (pairs < 2 || out.length !== sub.length) return -1;

    // Nearest master vertex to the anchor — the ring travels the same samples
    // each frame, so the head glides continuously as the dot advances.
    let head = 0;
    let best = Infinity;
    for (let i = 0; i < vertices; i++) {
        const dx = sub[i * 6] - anchor[0];
        const dy = sub[i * 6 + 1] - anchor[1];
        const dz = sub[i * 6 + 2] - anchor[2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) {
            best = d;
            head = i;
        }
    }
    // Future-only window: pair j connects the cycle vertex j to j+1. Vertex 0
    // is the exact anchor; vertex j (j ≥ 1) is master vertex head+j (mod V) —
    // so the first master edge (master[head] → head+1) is replaced by the
    // anchor edge and the last edge drawn ends at master vertex head−1, one
    // revolution later, without bridging back to the anchor.
    let w = 0;
    for (let j = 0; j < pairs; j++) {
        const a = j === 0 ? anchor : vertex(sub, head + j, vertices);
        const b = vertex(sub, head + j + 1, vertices);
        out[w++] = a[0];
        out[w++] = a[1];
        out[w++] = a[2];
        out[w++] = b[0];
        out[w++] = b[1];
        out[w++] = b[2];
    }
    return head;
}

function vertex(sub: Float32Array, i: number, vertices: number) {
    const k = i % vertices;
    // The chain stores one fewer `a` than vertex count: the last vertex only
    // exists as the previous pair's `b`. Same point by adjacency either way.
    const offset = k === vertices - 1 ? (k - 1) * 6 + 3 : k * 6;
    return sub.subarray(offset, offset + 3);
}

/**
 * Slide a time-uniform master window so that it starts at `headFrac` of the
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
