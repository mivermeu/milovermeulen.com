<script lang="ts">
    import * as THREE from 'three';
    import { untrack } from 'svelte';
    import { trackerState } from '$lib/state.svelte';
    import { categorize } from '$lib/tree';
    import { orbitalPeriodSeconds, trueAnomalyFromMean } from '$lib/orbit';
    import { blendInto, propagation } from '$lib/propagation';
    import { epochAction, renderBlend } from '$lib/simclock';
    import { renderEpochMs } from '$lib/state.svelte';
    import {
        brushChipText,
        brushFromCanvasRect,
        brushIsActiveForAxes,
        computeBrushMask,
        canvasXToData,
        canvasYToData,
        dragPassedThreshold,
        invalidateBrushOnAxisChange,
        normalizedRect,
        pointInBrush,
        type GraphBrush,
        type ScreenRect
    } from '$lib/graphBrush';
    import Panel from './Panel.svelte';
    import OrbitModelModal from './OrbitModelModal.svelte';
    import {
        EARTH_RADIUS_KM,
        FUNDAMENTAL,
        DERIVED,
        paramMeta,
        LIMITS,
        LOG_FLOOR,
        LOG_PARAMS,
        type ParamKey,
        type BaseParamKey
    } from '$lib/graph-params';

    const CATEGORY_COLORS: Record<string, number> = {
        communications: 0x818cf8,
        navigation: 0xff6900,
        'earth-observation': 0x34d399,
        weather: 0x22d3ee,
        science: 0xc084fc,
        military: 0xfb7185,
        debris: 0x94a3b8,
        other: 0x64748b
    };

    const MARGIN = { l: 40, r: 10, t: 18, b: 24 };
    const TICKS = 5;
    const MAX_POINTS = 60000;
    const MIN_W = 320;
    // Sane default panel width; the user can drag it larger up to MAX_W.
    const DEFAULT_W = 560;
    const MIN_H = 200;
    const MAX_W = 1400;
    const MAX_H = 1000;

    // Touch screens get a wider/taller default sheet (the compact desktop
    // profile wastes most of a phone); sizes stay user-resizable either way.
    const coarsePointer =
        typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

    interface Sample {
        index: number;
        uIndex: number;
        color: THREE.Color;
    }

    // The graph axis keys live in trackerState (not component-local state) so
    // URL deep links (`gx`/`gy`) can seed and mirror them.
    let xKey = $derived(trackerState.graphXKey);
    let yKey = $derived(trackerState.graphYKey);

    // Starts minimized; the + button in the corner expands it.
    let collapsed = $state(true);
    let showModel = $state(false);

    // Panel is anchored bottom-left; the top-right handle resizes it. Mobile
    // takes nearly the full viewport beside its 6px edges; desktop clamps to
    // the compact 560px profile. The SSR fallback (592px) yields DEFAULT_W.
    let width = $state(
        Math.min(
            coarsePointer ? MAX_W : Math.min(MAX_W, DEFAULT_W),
            Math.max(
                MIN_W,
                (typeof window === 'undefined' ? 592 : window.innerWidth) -
                    (coarsePointer ? 16 : 32)
            )
        )
    );
    let height = $state(
        coarsePointer
            ? Math.round(
                  Math.min(
                      560,
                      Math.max(
                          320,
                          (typeof window === 'undefined' ? 840 : window.innerHeight) * 0.5
                      )
                  )
              )
            : 320
    );
    let resizing = $state(false);
    let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

    let host: HTMLDivElement | undefined = $state();
    let canvas: HTMLCanvasElement | undefined = $state();
    let plot = $state({ l: 0, t: 0, w: 0, h: 0 });
    let xRange = $state<[number, number]>([0, 1]);
    let yRange = $state<[number, number]>([0, 1]);
    let xLog = $state(false);
    let yLog = $state(false);
    // Tooltip tracking the highlighted point: `uIndex` is the sample's position
    // in the filtered samples list so frame() can re-derive x/y values as the
    // blend glides — otherwise the tooltip drifts from the ring during playback.
    let hover = $state<{
        x: number;
        y: number;
        uIndex: number;
        name: string;
        xVal: number;
        yVal: number;
    } | null>(null);

    // --- Brush-select state -------------------------------------------------
    // TODO(a11y, deferred): interaction is pointer-first; a keyboard
    // alternative (focusable brush mode + arrow-key rect editing) is accepted
    // follow-up work.
    // pressActive: pointer is down on the canvas (potential brush start);
    // brushActive: the drag passed BRUSH_DRAG_THRESHOLD_PX so the live overlay
    // is up and picking/pinning are suppressed until release.
    let pressActive = false;
    let brushActive = $state(false);
    let brushStart = { x: 0, y: 0 };
    // Canvas-local min/max rect while dragging (clamped to the plot).
    let brushLive = $state<ScreenRect | null>(null);
    // True when the committed brush currently hides every visible point —
    // toggles only when the count crosses zero, never per frame.
    let brushEmpty = $state(false);

    let renderer: THREE.WebGLRenderer | undefined;
    let scene: THREE.Scene | undefined;
    let camera: THREE.OrthographicCamera | undefined;
    let points: THREE.Points | undefined;
    let geometry: THREE.BufferGeometry | undefined;
    let raycaster: THREE.Raycaster | undefined;
    let lastMoveWall = 0;

    // Live orbital elements from the shared propagation service, 7 per satellite
    // (a, e, i, raan, argp, m, u), indexed by the filtered/active position. We
    // blend the previous and next snapshots per frame so the points glide.
    let elPrev: Float32Array<ArrayBufferLike> = new Float32Array(0);
    let elNext: Float32Array<ArrayBufferLike> = new Float32Array(0);
    let elCurrent: Float32Array<ArrayBufferLike> = new Float32Array(0);
    let elPrevEpoch = 0;
    let elNextEpoch = 0;
    let catalogGen = 0;
    /**
     * Data regime of the held-forward snapshot (`message.revision`). -1 forces
     * the first snapshot to snap; older revisions are stale and dropped; newer
     * ones (catalog init / element-mode switch, even while paused) snap so the
     * fresh regime takes effect instead of blending across the switch.
     */
    let regimeRevision = -1;

    const xLabel = $derived(paramMeta(xKey).label);
    const yLabel = $derived(paramMeta(yKey).label);

    // Chip text for the committed brush (only while its axes are selected).
    const chipText = $derived.by(() => {
        const brush = trackerState.graphBrush;
        if (!brushIsActiveForAxes(brush, xKey, yKey)) return null;
        return brushChipText(
            brush,
            (k) => meta(k as Param).short,
            (k, v) => format(k as Param, v)
        );
    });

    // Data-space min/max under the live drag rect, for the per-axis labels.
    const brushAxesLive = $derived.by(() => {
        const r = brushLive;
        if (!r) return null;
        return {
            xMin: canvasXToData(r.x0, plot, xRange, xLog),
            xMax: canvasXToData(r.x1, plot, xRange, xLog),
            yMin: canvasYToData(r.y1, plot, yRange, yLog),
            yMax: canvasYToData(r.y0, plot, yRange, yLog)
        };
    });

    // Where each parameter sits inside the worker's 7-element-per-satellite block.
    const EL_INDEX: Record<BaseParamKey, number> = {
        a: 0,
        e: 1,
        i: 2,
        raan: 3,
        argp: 4,
        m: 5,
        u: 6
    };

    // Static per-satellite data; recomputed only when the catalog/filter changes.
    const samples = $derived.by(() => {
        const sats = trackerState.satellites;
        const active = trackerState.activeIndices;
        const out: Sample[] = [];
        for (let i = 0; i < active.length; i++) {
            const index = active[i];
            const sat = sats[index];
            if (!sat) continue;
            const category = categorize(sat.name, sat.objectType, sat.category);
            out.push({
                index,
                uIndex: i,
                color: new THREE.Color(CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other)
            });
        }
        return out;
    });

    // Hover (from either view) takes precedence; otherwise the pinned satellite.
    const focusIndex = $derived(
        trackerState.hoveredIndex >= 0 ? trackerState.hoveredIndex : trackerState.pinnedIndex
    );

    // Index the samples by satellite index so the highlight can be updated per
    // frame (from the RAF blend) rather than per snapshot.
    const samplesByIndex = $derived.by(() => new Map(samples.map((s) => [s.index, s])));

    function baseValue(els: Float32Array, s: Sample, key: BaseParamKey): number {
        return els[s.uIndex * 7 + EL_INDEX[key]] ?? 0;
    }

    function paramValueAt(els: Float32Array, s: Sample, key: ParamKey): number {
        switch (key) {
            case 'perigee':
                return baseValue(els, s, 'a') * (1 - baseValue(els, s, 'e')) - EARTH_RADIUS_KM;
            case 'apogee':
                return baseValue(els, s, 'a') * (1 + baseValue(els, s, 'e')) - EARTH_RADIUS_KM;
            case 'period':
                return orbitalPeriodSeconds(baseValue(els, s, 'a')) / 60;
            case 'nu':
                return trueAnomalyFromMean(baseValue(els, s, 'm'), baseValue(els, s, 'e'));
            default:
                return baseValue(els, s, key);
        }
    }

    function paramValue(s: Sample, key: ParamKey): number {
        return paramValueAt(elCurrent, s, key);
    }

    function axisRange(
        min: number,
        max: number,
        log: boolean,
        limit: [number, number] | undefined
    ): [number, number] {
        if (log) {
            const lo = Math.max(LOG_FLOOR, min);
            const hi = Math.max(LOG_FLOOR, max);
            return [lo / 10 ** 0.02, hi * 10 ** 0.02];
        }
        const pad = (max - min || 1) * 0.04;
        let lo = Math.max(0, min - pad);
        let hi = max + pad;
        if (limit) {
            lo = Math.max(limit[0], lo);
            hi = Math.min(limit[1], hi);
        }
        return [lo, hi];
    }

    function norm(value: number, range: [number, number], log: boolean): number {
        if (log) {
            const l0 = Math.log10(range[0]);
            const l1 = Math.log10(range[1]);
            return (Math.log10(Math.max(LOG_FLOOR, value)) - l0) / (l1 - l0 || 1);
        }
        return (value - range[0]) / (range[1] - range[0] || 1);
    }

    // White ring around the focused satellite's point, refreshed per frame.
    let highlightPoint = $state<{ x: number; y: number } | null>(null);

    function highlightValues(s: Sample): { xVal: number; yVal: number } {
        return { xVal: paramValue(s, xKey), yVal: paramValue(s, yKey) };
    }

    // Per-frame tooltip refresh, paired with updateHighlight() so the text and
    // the white ring always show the same instantaneous blend values.
    function updateHoverValues(): void {
        if (!hover) return;
        const sample = samples[hover.uIndex];
        if (!sample || elCurrent.length === 0) return;
        ({ xVal: hover.xVal, yVal: hover.yVal } = highlightValues(sample));
    }

    function updateHighlight(): void {
        if (focusIndex < 0 || plot.w === 0) {
            highlightPoint = null;
            return;
        }
        const s = samplesByIndex.get(focusIndex);
        if (!s) {
            highlightPoint = null;
            return;
        }
        const xv = paramValue(s, xKey);
        const yv = paramValue(s, yKey);
        if (
            !Number.isFinite(xv) ||
            !Number.isFinite(yv) ||
            !pointInBrush(trackerState.graphBrush, xKey, yKey, xv, yv)
        ) {
            highlightPoint = null;
            return;
        }
        highlightPoint = {
            x: plot.l + norm(xv, xRange, xLog) * plot.w,
            y: plot.t + (1 - norm(yv, yRange, yLog)) * plot.h
        };
    }

    function format(key: ParamKey, value: number): string {
        if (key === 'e') return value.toFixed(3);
        if (key === 'a' || key === 'perigee' || key === 'apogee')
            return Math.round(value).toLocaleString();
        return value.toFixed(1);
    }

    function tickValues(range: [number, number], log: boolean): number[] {
        if (log) {
            const l0 = Math.log10(range[0]);
            const l1 = Math.log10(range[1]);
            return Array.from(
                { length: TICKS },
                (_, i) => 10 ** (l0 + ((l1 - l0) * i) / (TICKS - 1))
            );
        }
        return Array.from(
            { length: TICKS },
            (_, i) => range[0] + ((range[1] - range[0]) * i) / (TICKS - 1)
        );
    }

    // Match the drawing buffer to the host and cache the plot rect. Only writes
    // `plot` when it actually moved, so the overlay doesn't churn every frame.
    function syncSize(): boolean {
        if (!renderer || !host || !camera) return false;
        const w0 = host.clientWidth;
        const h0 = host.clientHeight;
        if (w0 === 0 || h0 === 0) return false;

        renderer.setSize(w0, h0, false);
        camera.left = 0;
        camera.right = w0;
        camera.top = 0;
        camera.bottom = h0;
        camera.updateProjectionMatrix();

        const l = MARGIN.l;
        const t = MARGIN.t;
        const w = Math.max(1, w0 - MARGIN.l - MARGIN.r);
        const h = Math.max(1, h0 - MARGIN.t - MARGIN.b);
        if (plot.l !== l || plot.t !== t || plot.w !== w || plot.h !== h) plot = { l, t, w, h };
        return true;
    }

    // Scan both endpoints of the current blend so points stay inside the axis
    // while they glide between snapshots.
    function scanRange(
        key: ParamKey,
        isLog: boolean,
        limit: [number, number] | undefined
    ): [number, number] {
        const n = Math.min(samples.length, MAX_POINTS);
        let min = Infinity;
        let max = -Infinity;
        for (const els of [elPrev, elNext]) {
            if (els.length === 0) continue;
            for (let k = 0; k < n; k++) {
                const v = paramValueAt(els, samples[k], key);
                if (!Number.isFinite(v)) continue;
                if (v < min) min = v;
                if (v > max) max = v;
            }
        }
        if (min === Infinity) return isLog ? [LOG_FLOOR, LOG_FLOOR * 10] : [0, 1];
        return axisRange(min, max, isLog, limit);
    }

    function computeRanges(): void {
        const xIsLog = LOG_PARAMS.has(xKey);
        const yIsLog = LOG_PARAMS.has(yKey);
        xLog = xIsLog;
        yLog = yIsLog;
        xRange = scanRange(xKey, xIsLog, LIMITS[xKey]);
        yRange = scanRange(yKey, yIsLog, LIMITS[yKey]);
    }

    function applyColors(): void {
        if (!geometry) return;
        const color = geometry.getAttribute('color') as THREE.BufferAttribute;
        const n = Math.min(samples.length, MAX_POINTS);
        for (let k = 0; k < n; k++) {
            const c = samples[k].color;
            color.setXYZ(k, c.r, c.g, c.b);
        }
        color.needsUpdate = true;
    }

    // Per-frame hot path: positions only, using the ranges cached by `layout`.
    // Brush filtering happens HERE, at render time: a sample outside the brush
    // keeps its array slot (uIndex) and is parked offscreen instead of being
    // removed or reordered — the pick raycast then simply can't hit it.
    function updatePoints(): void {
        if (!renderer || !camera || !geometry || !scene) return;
        const n = Math.min(samples.length, MAX_POINTS);
        if (n === 0 || elCurrent.length === 0) {
            geometry.setDrawRange(0, 0);
            updateHoverValues();
            updateHighlight();
            renderer.render(scene, camera);
            return;
        }

        const brush = trackerState.graphBrush;
        const brushing = brush !== null;
        const position = geometry.getAttribute('position') as THREE.BufferAttribute;
        const l = plot.l;
        const t = plot.t;
        const w = plot.w;
        const h = plot.h;
        let visible = 0;
        for (let k = 0; k < n; k++) {
            const s = samples[k];
            const xv = paramValue(s, xKey);
            const yv = paramValue(s, yKey);
            const xn = norm(xv, xRange, xLog);
            const yn = norm(yv, yRange, yLog);
            if (
                !Number.isFinite(xn) ||
                !Number.isFinite(yn) ||
                (brushing && !pointInBrush(brush, xKey, yKey, xv, yv))
            ) {
                // NaN row (failed propagation off the worker) or brushed-out
                // point — park the dot far offscreen so it can't poison the
                // geometry's bounding sphere.
                position.setXYZ(k, -10000, -10000, 0);
                continue;
            }
            visible++;
            position.setXYZ(k, l + xn * w, t + (1 - yn) * h, 0);
        }
        position.needsUpdate = true;
        geometry.setDrawRange(0, n);
        // Keep pick raycasts honest: invalidate the cached bounding sphere (it
        // is recomputed lazily from the live buffer on the next pick).
        geometry.boundingSphere = null;
        // Only meaningful with an active brush; the no-op $state write when it
        // doesn't change is free.
        brushEmpty = brushing && visible === 0;
        updateHoverValues();
        updateHighlight();
        renderer.render(scene, camera);
    }

    // Cold path: resize, axis ranges and colors. Runs on a new snapshot, an axis
    // change, or a resize — not every frame.
    function layout(): void {
        if (!syncSize()) return;
        computeRanges();
        applyColors();
        updatePoints();
    }

    function pick(event: PointerEvent): number | null {
        if (!canvas || !raycaster || !camera || !points) return null;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        // Touch has no hover to pre-refine a tap — widen the catch radius.
        raycaster.params.Points.threshold = event.pointerType === 'touch' ? 14 : 5;
        const pointer = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(points)[0];
        return hit?.index !== undefined ? hit.index : null;
    }

    // --- Brush-select interaction -------------------------------------------
    // A press starts a potential brush; only once the drag passes
    // BRUSH_DRAG_THRESHOLD_PX does the live overlay open and picking/pinning
    // get suppressed, so plain hover and click-to-pin behave exactly as today.

    function canvasPoint(event: PointerEvent): { x: number; y: number } {
        const rect = canvas!.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function onPointerDown(event: PointerEvent): void {
        // Only the primary pointer drives the brush; a second touch during a
        // drag must not clobber the rect.
        if (pressActive || !event.isPrimary || !canvas) return;
        pressActive = true;
        // Clamp the start corner to the plot: a press in a canvas margin must
        // not inflate the dominant-axis extent (it would let the painted
        // margin distance commit a degenerate edge column).
        const p = canvasPoint(event);
        const { l, t, w, h } = plot;
        brushStart = {
            x: Math.min(Math.max(p.x, l), l + w),
            y: Math.min(Math.max(p.y, t), t + h)
        };
        // Capture so a drag ending over the chip/axis row still commits.
        canvas.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent): void {
        if (pressActive && !brushActive) {
            const p = canvasPoint(event);
            if (dragPassedThreshold(brushStart.x, brushStart.y, p.x, p.y)) {
                // Brush begins: suppress hover/picking for the whole drag.
                brushActive = true;
                hover = null;
                trackerState.hoveredIndex = -1;
            }
        }
        if (brushActive) {
            // Rect updates bypass the hover throttle so the overlay is fluid.
            brushLive = updateBrushRect(canvasPoint(event));
            return;
        }
        const now = performance.now();
        if (now - lastMoveWall < 33) return;
        lastMoveWall = now;
        const index = pick(event);
        if (index === null || !canvas) {
            hover = null;
            trackerState.hoveredIndex = -1;
            return;
        }
        const sample = samples[index];
        trackerState.hoveredIndex = sample.index;
        const rect = canvas.getBoundingClientRect();
        hover = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            uIndex: index,
            name: trackerState.satellites[sample.index]?.name ?? '',
            ...highlightValues(sample)
        };
    }

    function updateBrushRect(p: { x: number; y: number }): ScreenRect | null {
        const { l, t, w, h } = plot;
        const x = Math.min(Math.max(p.x, l), l + w);
        const y = Math.min(Math.max(p.y, t), t + h);
        // Clamp to plot bounds so the rect stays inside the axes even when the
        // pointer leaves the canvas (pointer capture keeps events flowing).
        return normalizedRect(brushStart.x, brushStart.y, x, y);
    }

    function releaseBrushCapture(event: PointerEvent): void {
        const el = event.currentTarget as HTMLElement;
        if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    }

    function onPointerUp(event: PointerEvent): void {
        releaseBrushCapture(event);
        if (!brushActive) {
            // Sub-threshold press → exactly the old click behavior.
            const index = pick(event);
            if (index !== null) trackerState.pinnedIndex = samples[index].index;
            // Clicking empty space unpins, matching the globe's click behavior.
            else trackerState.pinnedIndex = -1;
            return;
        }
        // Released drag ≥ threshold → commit (or clear via a null brush from a
        // tiny/hairline rect, per brushFromCanvasRect).
        const rect = brushLive;
        endBrushInteraction();
        if (!rect) return;
        const brush = brushFromCanvasRect(rect, { xKey, yKey, plot, xRange, yRange, xLog, yLog });
        trackerState.graphBrush = brush;
        if (brush) clearFocusOutsideBrush(brush);
    }

    function onPointerLeave(): void {
        hover = null;
        trackerState.hoveredIndex = -1;
    }

    function onPointerCancel(event: PointerEvent): void {
        // Cancelled drag: abort without commit, keep today's state intact.
        releaseBrushCapture(event);
        endBrushInteraction();
    }

    function endBrushInteraction(): void {
        pressActive = false;
        brushActive = false;
        brushLive = null;
    }

    // A committed brush filters both views — satellites it ignores can't stay
    // hovered or pinned (mirrors the tree filter's unpin behavior).
    function clearFocusOutsideBrush(brush: GraphBrush): void {
        for (const index of [trackerState.hoveredIndex, trackerState.pinnedIndex]) {
            if (index < 0) continue;
            const s = samplesByIndex.get(index);
            if (!s) continue;
            const xv = paramValue(s, xKey);
            const yv = paramValue(s, yKey);
            if (!pointInBrush(brush, xKey, yKey, xv, yv)) {
                if (trackerState.hoveredIndex === index) {
                    trackerState.hoveredIndex = -1;
                    // Also drop the globe-side hover payload so a stale tooltip
                    // doesn't linger until the next globe pointermove.
                    trackerState.hovered = null;
                }
                if (trackerState.pinnedIndex === index) trackerState.pinnedIndex = -1;
            }
        }
    }

    function clearBrush(): void {
        trackerState.graphBrush = null;
    }

    let panelBox: HTMLDivElement | undefined = $state();

    function onHandleDown(event: PointerEvent): void {
        resizing = true;
        // Baseline from the rendered box: on mobile the panel is CSS-clamped
        // (max-w/max-h), so drag math must start from the clamped size.
        const rect = panelBox?.getBoundingClientRect();
        resizeStart = {
            x: event.clientX,
            y: event.clientY,
            w: Math.round(rect?.width ?? width),
            h: Math.round(rect?.height ?? height)
        };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }

    function onHandleMove(event: PointerEvent): void {
        if (!resizing) return;
        width = Math.min(MAX_W, Math.max(MIN_W, resizeStart.w + (event.clientX - resizeStart.x)));
        height = Math.min(MAX_H, Math.max(MIN_H, resizeStart.h + (resizeStart.y - event.clientY)));
    }

    function onHandleUp(event: PointerEvent): void {
        // pointercancel implies capture is already released (NotFoundError otherwise).
        const el = event.currentTarget as HTMLElement;
        if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
        resizing = false;
    }

    function circleTexture(): THREE.Texture {
        const size = 64;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        return new THREE.CanvasTexture(c);
    }

    let rafId = 0;

    // Per-frame: blend the last two snapshots into the current element values.
    // Angular channels (raan, argp, m, u) blend along the shortest arc so the
    // 359°→0° wrap of one orbit period doesn't drag points across the chart.
    function frame(): void {
        rafId = requestAnimationFrame(frame);
        if (elCurrent.length === 0) return;
        // Blend against the shared simulated clock — the exact same epoch the
        // globe renders from, so the two views always show the same instant.
        // renderEpochMs interpolates between clock ticks at frame rate, and
        // the factor keeps growing past the newest snapshot (dead reckoning,
        // capped via renderBlend), matching the globe's behavior at 600×.
        const simEpoch = renderEpochMs();
        const blend = renderBlend(elPrevEpoch, elNextEpoch, simEpoch);
        blendInto(elPrev, elNext, elCurrent, blend, 7, [3, 4, 5, 6]);
        updatePoints();
    }

    // --- Brush → globe bridge ------------------------------------------------
    // Publish the composed (tree ∩ brush) visible mask for the globe. Values
    // come from the freshest snapshot (elNext); the graph itself re-checks
    // membership per frame in updatePoints, while the globe refreshes once per
    // snapshot and whenever the brush/tree set/axes change. trackerState reads
    // here are untracked on purpose — callers track what must retrigger this
    // (a tracked deep read inside history effects caused catalog re-inits).
    function publishBrushMask(): void {
        trackerState.brushMask = computeBrushMask(
            trackerState.graphBrush,
            xKey,
            yKey,
            samples,
            (s) => ({ x: paramValueAt(elNext, s, xKey), y: paramValueAt(elNext, s, yKey) })
        );
    }

    // Set up three.js once the canvas/host refs exist, and subscribe to the
    // shared propagation service for positions + orbital elements.
    $effect(() => {
        if (!canvas || !host) return;
        let r: THREE.WebGLRenderer;
        try {
            r = new THREE.WebGLRenderer({ canvas, antialias: false });
        } catch {
            return;
        }
        r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        r.setClearColor(0x000000, 0);
        const s = new THREE.Scene();
        const cam = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3)
        );
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3));
        const tex = circleTexture();
        const pts = new THREE.Points(
            geo,
            new THREE.PointsMaterial({
                size: 3,
                sizeAttenuation: false,
                vertexColors: true,
                map: tex,
                alphaTest: 0.5,
                transparent: true,
                opacity: 0.9
            })
        );
        // The plot spans its own canvas, so frustum culling is meaningless — and
        // worse, the renderer computes the geometry's bounding sphere once on the
        // first render (over the still-empty buffer = a 0-radius sphere at the
        // origin) and never invalidates it, which permanently kills every
        // subsequent pick raycast.
        pts.frustumCulled = false;
        s.add(pts);
        const ray = new THREE.Raycaster();
        ray.params.Points.threshold = 5;

        renderer = r;
        scene = s;
        camera = cam;
        geometry = geo;
        points = pts;
        raycaster = ray;

        const observer = new ResizeObserver(() => layout());
        observer.observe(host);
        untrack(() => layout());

        const unsubscribe = propagation.subscribe((message) => {
            if (message.type !== 'positions' || !message.elements || message.epoch === undefined)
                return;
            // A new catalog (same or different size) must not blend into the
            // previous one — snap straight to the new snapshot.
            if (message.generation !== catalogGen) {
                catalogGen = message.generation ?? 0;
                elPrev = message.elements;
                elPrevEpoch = message.epoch;
                elNext = message.elements;
                elNextEpoch = message.epoch;
                elCurrent = new Float32Array(message.elements);
                regimeRevision = message.revision ?? -1;
                layout();
                publishBrushMask();
                return;
            }
            // Data-regime versioning: a newer revision (catalog init or
            // element-mode switch — even while paused) means fresh data must
            // replace the pair; an older one is a stale in-flight response.
            // Same-revision backwards epochs are also stale (a watchdog refire
            // overtaking a slow original, on a FIFO worker) and drop —
            // deliberate backwards jumps always ride a revision bump.
            const messageRevision = message.revision ?? -1;
            if (messageRevision < regimeRevision) return;
            if (messageRevision === regimeRevision && message.epoch < elNextEpoch) return;
            // Continuity guard shared with the globe: routine simulated-time
            // advances blend; discontinuous epochs snap; same-epoch
            // snapshots (paused clock) drop — repeated stamps have span ≈ 0 and
            // the render stays static.
            const action =
                messageRevision > regimeRevision ||
                epochAction(
                    elNextEpoch,
                    message.epoch,
                    propagation.cadenceMs * trackerState.simSpeed
                ) === 'snap'
                    ? 'snap'
                    : 'blend';
            regimeRevision = messageRevision;
            if (action === 'snap') {
                elPrev = message.elements;
                elPrevEpoch = message.epoch;
                elNext = message.elements;
                elNextEpoch = message.epoch;
                elCurrent = new Float32Array(message.elements);
                layout();
                return;
            }
            if (message.epoch === elNextEpoch) return; // same epoch → same data
            elPrev = elNext;
            elPrevEpoch = elNextEpoch;
            elNext = message.elements;
            elNextEpoch = message.epoch;
            if (elCurrent.length !== message.elements.length) {
                elCurrent = new Float32Array(message.elements.length);
                elCurrent.set(message.elements);
            }
            layout();
            publishBrushMask();
        });
        rafId = requestAnimationFrame(frame);

        return () => {
            unsubscribe();
            cancelAnimationFrame(rafId);
            observer.disconnect();
            geo.dispose();
            tex.dispose();
            (pts.material as THREE.Material).dispose();
            r.dispose();
            renderer = undefined;
            scene = undefined;
            camera = undefined;
            geometry = undefined;
            points = undefined;
            raycaster = undefined;
        };
    });

    // Re-layout when the active set, catalog, or axes change.
    $effect(() => {
        void samples;
        void xKey;
        void yKey;
        untrack(() => layout());
    });

    // Axis-change policy: a brush drawn in one parameter space is meaningless
    // in another — switching x/y axes CLEARS the committed brush (the region
    // is never silently re-evaluated). Valid brushes keep their reference so
    // this stays a no-op.
    $effect(() => {
        const brush = trackerState.graphBrush;
        const validated = invalidateBrushOnAxisChange(brush, xKey, yKey);
        if (validated !== brush) trackerState.graphBrush = validated;
    });

    // Republish the globe's brush mask when the brush, the tree-filtered set,
    // or the axes change. The writes that feed computeBrushMask (element
    // arrays) are deliberately untracked — snapshot-driven refreshes come from
    // the propagation callback, not from per-frame reactive churn (history:
    // a tracked deep read caused catalog re-inits).
    $effect(() => {
        void trackerState.graphBrush;
        void samples;
        void xKey;
        void yKey;
        untrack(publishBrushMask);
    });
</script>

{#snippet infoTip(key: ParamKey)}
    <span class="group relative inline-flex">
        <button
            type="button"
            aria-label={`About ${paramMeta(key).label}`}
            class="flex h-5 w-5 items-center justify-center rounded-full border border-brand-text/30 p-0 text-[9px] font-semibold text-brand-text/60 hover:border-brand-text/60 hover:bg-transparent hover:text-brand-text"
            >i</button
        >
        <span
            role="tooltip"
            class="pointer-events-none absolute top-5 right-0 z-40 hidden w-52 rounded border border-brand-secondary bg-brand-bg/95 p-2 text-[10px] leading-snug text-brand-text shadow-lg group-focus-within:block group-hover:block"
            >{paramMeta(key).desc}</span
        >
    </span>
{/snippet}

{#if collapsed}
    <button
        type="button"
        aria-label="Expand orbital graph"
        title="Orbital graph"
        class="pointer-events-auto absolute bottom-1.5 left-1.5 z-20 flex items-center gap-2 rounded-lg border border-brand-secondary bg-brand-secondary/85 px-3 py-2 text-xs font-semibold text-brand-text-highlight shadow-lg backdrop-blur-sm transition-colors hover:bg-brand-secondary md:bottom-3 md:left-3"
        onclick={() => (collapsed = false)}
    >
        <svg viewBox="0 0 12 12" class="h-3 w-3" aria-hidden="true">
            <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.6" fill="none" />
        </svg>
        Orbital graph
    </button>
{:else}
    <div
        bind:this={panelBox}
        class="pointer-events-none absolute bottom-1.5 left-1.5 z-20 max-md:max-h-[calc(100%-0.75rem)] max-md:max-w-[calc(100%-0.75rem)] md:bottom-3 md:left-3 md:max-w-[calc(100%-1.5rem)]"
        style:width="{width}px"
        style:height="{height}px"
    >
        <div class="pointer-events-auto grid h-full w-full">
            <Panel title="Orbital graph">
                {#snippet actions()}
                    <div class="flex items-center gap-1 pr-6 pb-1">
                        <button
                            type="button"
                            aria-label="Minimize orbital graph"
                            class="flex h-5 w-5 items-center justify-center rounded border border-brand-secondary p-0 text-brand-text-highlight hover:bg-white/10"
                            onclick={() => (collapsed = true)}
                        >
                            <svg viewBox="0 0 12 12" class="h-3 w-3" aria-hidden="true">
                                <path
                                    d="M1 6h10"
                                    stroke="currentColor"
                                    stroke-width="1.6"
                                    fill="none"
                                />
                            </svg>
                        </button>
                    </div>
                {/snippet}

                <div
                    class="flex shrink-0 flex-wrap items-center gap-1 pb-2 text-[10px] text-brand-text"
                >
                    <select
                        bind:value={trackerState.graphXKey}
                        aria-label="X axis parameter"
                        class="rounded border border-brand-secondary bg-brand-bg px-1 py-0.5"
                    >
                        {#each FUNDAMENTAL as p (p.key)}
                            <option value={p.key}>{p.short} — {p.label}</option>
                        {/each}
                        <option disabled>──────────</option>
                        {#each DERIVED as p (p.key)}
                            <option value={p.key}>{p.short} — {p.label}</option>
                        {/each}
                    </select>
                    {@render infoTip(xKey)}
                    <span class="text-brand-text/50">×</span>
                    <select
                        bind:value={trackerState.graphYKey}
                        aria-label="Y axis parameter"
                        class="rounded border border-brand-secondary bg-brand-bg px-1 py-0.5"
                    >
                        {#each FUNDAMENTAL as p (p.key)}
                            <option value={p.key}>{p.short} — {p.label}</option>
                        {/each}
                        <option disabled>──────────</option>
                        {#each DERIVED as p (p.key)}
                            <option value={p.key}>{p.short} — {p.label}</option>
                        {/each}
                    </select>
                    {@render infoTip(yKey)}
                    <button
                        type="button"
                        aria-label="Open the orbital element explorer"
                        class="flex h-5 items-center justify-center rounded border border-brand-text/30 p-0 px-1.5 text-[9px] font-semibold text-brand-text/60 hover:border-brand-text/60 hover:bg-transparent hover:text-brand-text"
                        onclick={() => (showModel = true)}>?</button
                    >
                    {#if chipText}
                        <div
                            class="flex items-center gap-1 rounded border border-brand-text/50 bg-brand-bg px-1.5 py-0.5 text-[10px] text-brand-text-highlight"
                        >
                            <span class="whitespace-nowrap">Brush {chipText}</span>
                            <button
                                type="button"
                                aria-label="Clear brush filter"
                                class="flex h-4 w-4 items-center justify-center rounded border-0 p-0 text-brand-text/70 hover:bg-white/10 hover:text-brand-text"
                                onclick={clearBrush}
                            >
                                <svg viewBox="0 0 10 10" class="h-2.5 w-2.5" aria-hidden="true">
                                    <path
                                        d="M1 1 9 9M9 1 1 9"
                                        stroke="currentColor"
                                        stroke-width="1.6"
                                        fill="none"
                                    />
                                </svg>
                            </button>
                        </div>
                    {/if}
                </div>

                <div bind:this={host} class="relative min-h-0 flex-1">
                    <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
                    <canvas
                        bind:this={canvas}
                        role="img"
                        aria-label={`Orbital element scatter plot: ${xLabel} versus ${yLabel}, ${samples.length} satellites`}
                        class="block h-full w-full cursor-crosshair touch-none"
                        onpointerdown={onPointerDown}
                        onpointermove={onPointerMove}
                        onpointerleave={onPointerLeave}
                        onpointerup={onPointerUp}
                        onpointercancel={onPointerCancel}
                    ></canvas>

                    {#if plot.w > 0}
                        <div
                            class="pointer-events-none absolute inset-0 text-[9px] text-brand-text/60"
                        >
                            {#each tickValues(xRange, xLog) as v, i (i)}
                                <div
                                    class="absolute w-px bg-white/10"
                                    style:left="{plot.l + norm(v, xRange, xLog) * plot.w}px"
                                    style:top="{plot.t}px"
                                    style:height="{plot.h}px"
                                ></div>
                            {/each}
                            {#each tickValues(yRange, yLog) as v, i (i)}
                                <div
                                    class="absolute h-px bg-white/10"
                                    style:left="{plot.l}px"
                                    style:top="{plot.t + (1 - norm(v, yRange, yLog)) * plot.h}px"
                                    style:width="{plot.w}px"
                                ></div>
                            {/each}
                            <div
                                class="absolute w-px bg-brand-text/30"
                                style:left="{plot.l}px"
                                style:top="{plot.t}px"
                                style:height="{plot.h}px"
                            ></div>
                            <div
                                class="absolute h-px bg-brand-text/30"
                                style:left="{plot.l}px"
                                style:top="{plot.t + plot.h}px"
                                style:width="{plot.w}px"
                            ></div>

                            {#each tickValues(xRange, xLog) as v, i (i)}
                                <span
                                    class="absolute -translate-x-1/2"
                                    style:left="{plot.l + norm(v, xRange, xLog) * plot.w}px"
                                    style:top="{plot.t + plot.h + 3}px">{format(xKey, v)}</span
                                >
                            {/each}
                            {#each tickValues(yRange, yLog) as v, i (i)}
                                <span
                                    class="absolute -translate-y-1/2 text-right"
                                    style:left="0px"
                                    style:width="{plot.l - 6}px"
                                    style:top="{plot.t + (1 - norm(v, yRange, yLog)) * plot.h}px"
                                    >{format(yKey, v)}</span
                                >
                            {/each}
                            <span
                                class="absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
                                style:top="{plot.t + plot.h + 12}px">{xLabel}</span
                            >
                            <span class="absolute left-1 whitespace-nowrap" style:top="0px"
                                >{yLabel}</span
                            >
                        </div>
                    {/if}

                    {#if highlightPoint}
                        <div
                            class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                            style:left="{highlightPoint.x}px"
                            style:top="{highlightPoint.y}px"
                            style:width="10px"
                            style:height="10px"
                        ></div>
                    {/if}

                    {#if brushLive && brushAxesLive}
                        <div
                            class="pointer-events-none absolute z-10 border border-brand-text/70 bg-brand-text/10"
                            style:left="{brushLive.x0}px"
                            style:top="{brushLive.y0}px"
                            style:width="{brushLive.x1 - brushLive.x0}px"
                            style:height="{brushLive.y1 - brushLive.y0}px"
                        >
                            <span
                                class="absolute bottom-0.5 left-0.5 rounded bg-brand-bg/85 px-1 py-px text-[9px] text-brand-text"
                            >
                                {format(xKey, brushAxesLive.xMin)}–{format(
                                    xKey,
                                    brushAxesLive.xMax
                                )}
                            </span>
                            <span
                                class="absolute top-0.5 right-0.5 rounded bg-brand-bg/85 px-1 py-px text-[9px] text-brand-text"
                            >
                                {format(yKey, brushAxesLive.yMin)}–{format(
                                    yKey,
                                    brushAxesLive.yMax
                                )}
                            </span>
                        </div>
                    {/if}

                    {#if samples.length === 0}
                        <div
                            class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-brand-text/60"
                        >
                            No active satellites
                        </div>
                    {:else if brushEmpty}
                        <div
                            class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-brand-text/60"
                        >
                            No satellites in brush
                        </div>
                    {/if}

                    {#if hover}
                        <div
                            class="pointer-events-none absolute z-20 rounded border border-brand-secondary bg-brand-bg/95 px-2 py-0.5 text-[10px] whitespace-nowrap text-brand-text"
                            style:left="{hover.x + 10}px"
                            style:top="{hover.y + 10}px"
                        >
                            <div class="font-medium text-brand-text-highlight">{hover.name}</div>
                            <div class="text-brand-text/80">
                                {#if Number.isFinite(hover.xVal)}
                                    {paramMeta(xKey).short} {format(xKey, hover.xVal)}{:else}—{/if}
                                <span class="text-brand-text/50">×</span>
                                {#if Number.isFinite(hover.yVal)}
                                    {paramMeta(yKey).short} {format(yKey, hover.yVal)}{:else}—{/if}
                            </div>
                        </div>
                    {/if}
                </div>
            </Panel>

            <button
                type="button"
                aria-label="Resize graph"
                class="absolute top-0 right-0 z-30 flex h-6 w-6 cursor-nesw-resize touch-none items-center justify-center rounded border-0 p-1.5 text-brand-text/40 hover:bg-transparent hover:text-brand-text"
                onpointerdown={onHandleDown}
                onpointermove={onHandleMove}
                onpointerup={onHandleUp}
                onpointercancel={onHandleUp}
            >
                <svg
                    viewBox="0 0 10 10"
                    class="h-full w-full"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path
                        d="M1 1 9 9M5 1 9 5"
                        stroke="currentColor"
                        stroke-width="1.4"
                        fill="none"
                    />
                </svg>
            </button>
        </div>
    </div>
{/if}

{#if showModel}
    <OrbitModelModal onclose={() => (showModel = false)} />
{/if}
