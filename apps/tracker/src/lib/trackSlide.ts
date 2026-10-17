/** Per-frame sliding of baked track polylines by time: write the `[target, target + period]` window per frame. */
export interface BakedChain {
    positions: Float32Array;
    times: Float32Array;
    vertexCount: number;
    periodMs: number;
}

/** Index of the first vertex at or after `target`; −1 when the bake holds nothing that late. */
export function firstVertexAtOrAfter(
    times: Float32Array,
    offset: number,
    count: number,
    target: number
): number {
    if (count <= 0 || offset + count > times.length) return -1;
    if (!Number.isFinite(target)) return -1;
    let lo = offset;
    let hi = offset + count - 1;
    if (times[hi] < target) return -1;
    if (times[lo] >= target) return 0;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < target) lo = mid + 1;
        else hi = mid;
    }
    return lo - offset;
}

/** Write the `[target, target + period]` window into a fixed edge-slot; unused tail is zero-padded. Returns edges written. */
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
    let n = 0;
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

    if (!(periodMs > 0)) {
        out.fill(0, outBase, outBase + maxEdges * 6);
        return 0;
    }
    const head = firstVertexAtOrAfter(times, vertexOffset, vertexCount, target);
    if (head < 0) {
        out.fill(0, outBase, outBase + maxEdges * 6);
        return 0;
    }
    const endIdx = firstVertexAtOrAfter(times, vertexOffset, vertexCount, target + periodMs);
    if (endIdx === head) {
        out.fill(0, outBase, outBase + maxEdges * 6);
        return 0;
    }
    const endLimit = endIdx < 0 ? vertexCount : endIdx;

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
