<script lang="ts">
    import * as THREE from 'three';
    import { trackerState } from '$lib/state.svelte';
    import { categorize } from '$lib/tree';
    import { orbitalPeriodSeconds, trueAnomalyFromMean, type OrbitalElements } from '$lib/orbit';
    import { propagation } from '$lib/propagation';
    import Panel from './Panel.svelte';
    import OrbitModelModal from './OrbitModelModal.svelte';

    type BaseParam = keyof OrbitalElements | 'u';
    type DerivedParam = 'perigee' | 'apogee' | 'period' | 'nu';
    type Param = BaseParam | DerivedParam;

    const EARTH_RADIUS_KM = 6371;

    // The six fundamental Keplerian elements. `short` is the symbol, `label` the
    // precise axis name, and `desc` a plain-language explanation for the tooltip.
    const FUNDAMENTAL: { key: Param; label: string; short: string; desc: string }[] = [
        {
            key: 'a',
            label: 'Semi-major axis (km)',
            short: 'a',
            desc: "The orbit's size — roughly its average distance from Earth's centre."
        },
        {
            key: 'e',
            label: 'Eccentricity',
            short: 'e',
            desc: "The orbit's shape: 0 is a perfect circle, higher values are more stretched."
        },
        {
            key: 'i',
            label: 'Inclination (°)',
            short: 'i',
            desc: 'How far the orbit is tilted from the equator (0° means it never leaves it).'
        },
        {
            key: 'raan',
            label: 'RAAN (°)',
            short: 'Ω',
            desc: 'Where the orbit crosses the equator heading north.'
        },
        {
            key: 'argp',
            label: 'Arg. of periapsis (°)',
            short: 'ω',
            desc: "Where the orbit's closest point to Earth sits within the orbit."
        },
        {
            key: 'm',
            label: 'Mean anomaly (°)',
            short: 'M',
            desc: 'Where the satellite is along its orbit, measured from that closest point.'
        }
    ];

    // Derived quantities, shown after a separator in the pickers. All are pure
    // functions of the live element set, so they work in every mode.
    const DERIVED: { key: Param; label: string; short: string; desc: string }[] = [
        {
            key: 'u',
            label: 'Anomaly past asc. node (°)',
            short: 'u',
            desc: 'The angle from the equator crossing to the satellite; it advances as the satellite moves.'
        },
        {
            key: 'perigee',
            label: 'Perigee altitude (km)',
            short: 'peri',
            desc: 'How low the orbit gets — its closest approach to the surface.'
        },
        {
            key: 'apogee',
            label: 'Apogee altitude (km)',
            short: 'apo',
            desc: 'How high the orbit gets — its farthest point from the surface.'
        },
        {
            key: 'period',
            label: 'Orbital period (min)',
            short: 'T',
            desc: 'How long one full orbit takes.'
        },
        {
            key: 'nu',
            label: 'True anomaly (°)',
            short: 'ν',
            desc: "The satellite's actual angle from perigee — its real position along the orbit."
        }
    ];
    const ALL_PARAMS = [...FUNDAMENTAL, ...DERIVED];

    function meta(key: Param) {
        return ALL_PARAMS.find((p) => p.key === key) ?? ALL_PARAMS[0];
    }

    // Natural bounds for parameters that have them; axes are clamped to these so
    // e.g. Ω / ω / M / u never show a tick past 360°.
    const LIMITS: Partial<Record<Param, [number, number]>> = {
        e: [0, 1],
        i: [0, 180],
        raan: [0, 360],
        argp: [0, 360],
        m: [0, 360],
        u: [0, 360],
        nu: [0, 360]
    };

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
    const MIN_H = 200;
    const MAX_W = 1400;
    const MAX_H = 1000;

    interface Sample {
        index: number;
        uIndex: number;
        color: THREE.Color;
    }

    let xKey = $state<Param>('a');
    let yKey = $state<Param>('i');

    // Starts minimized; the + button in the corner expands it.
    let collapsed = $state(true);
    let showModel = $state(false);

    // Panel is anchored bottom-left; the top-right handle resizes it.
    let width = $state(560);
    let height = $state(320);
    let resizing = $state(false);
    let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

    let host: HTMLDivElement | undefined = $state();
    let canvas: HTMLCanvasElement | undefined = $state();
    let plot = $state({ l: 0, t: 0, w: 0, h: 0 });
    let xRange = $state<[number, number]>([0, 1]);
    let yRange = $state<[number, number]>([0, 1]);
    let xLog = $state(false);
    let yLog = $state(false);
    let hover = $state<{ x: number; y: number; name: string } | null>(null);

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

    const xLabel = $derived(ALL_PARAMS.find((p) => p.key === xKey)?.label ?? '');
    const yLabel = $derived(ALL_PARAMS.find((p) => p.key === yKey)?.label ?? '');

    // Where each parameter sits inside the worker's 7-element-per-satellite block.
    const EL_INDEX: Record<BaseParam, number> = { a: 0, e: 1, i: 2, raan: 3, argp: 4, m: 5, u: 6 };

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

    function baseValue(s: Sample, key: BaseParam): number {
        return elCurrent[s.uIndex * 7 + EL_INDEX[key]] ?? 0;
    }

    function paramValue(s: Sample, key: Param): number {
        switch (key) {
            case 'perigee':
                return baseValue(s, 'a') * (1 - baseValue(s, 'e')) - EARTH_RADIUS_KM;
            case 'apogee':
                return baseValue(s, 'a') * (1 + baseValue(s, 'e')) - EARTH_RADIUS_KM;
            case 'period':
                return orbitalPeriodSeconds(baseValue(s, 'a')) / 60;
            case 'nu':
                return trueAnomalyFromMean(baseValue(s, 'm'), baseValue(s, 'e'));
            default:
                return baseValue(s, key);
        }
    }

    function axisRange(
        min: number,
        max: number,
        log: boolean,
        limit: [number, number] | undefined
    ): [number, number] {
        if (log) return [min / 10 ** 0.02, max * 10 ** 0.02];
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
            return (Math.log10(value) - l0) / (l1 - l0 || 1);
        }
        return (value - range[0]) / (range[1] - range[0] || 1);
    }

    const highlightPos = $derived.by(() => {
        if (focusIndex < 0 || plot.w === 0) return null;
        const s = samples.find((x) => x.index === focusIndex);
        if (!s) return null;
        return {
            x: plot.l + norm(paramValue(s, xKey), xRange, xLog) * plot.w,
            y: plot.t + (1 - norm(paramValue(s, yKey), yRange, yLog)) * plot.h
        };
    });

    function format(key: Param, value: number): string {
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

    function draw(): void {
        if (!renderer || !host || !camera || !geometry || !scene) return;
        const w0 = host.clientWidth;
        const h0 = host.clientHeight;
        if (w0 === 0 || h0 === 0) return;

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
        plot = { l, t, w, h };

        const n = Math.min(samples.length, MAX_POINTS);
        if (n === 0) {
            geometry.setDrawRange(0, 0);
            renderer.render(scene, camera);
            return;
        }

        let xmin = Infinity;
        let xmax = -Infinity;
        let ymin = Infinity;
        let ymax = -Infinity;
        for (let k = 0; k < n; k++) {
            const x = paramValue(samples[k], xKey);
            const y = paramValue(samples[k], yKey);
            if (x < xmin) xmin = x;
            if (x > xmax) xmax = x;
            if (y < ymin) ymin = y;
            if (y > ymax) ymax = y;
        }

        // The semi-major axis spans LEO (~6,800 km) to deep-space probes
        // (>500,000 km), so it gets a log scale; the others stay linear.
        const xIsLog = xKey === 'a' || xKey === 'period';
        const yIsLog = yKey === 'a' || yKey === 'period';
        const xr = axisRange(xmin, xmax, xIsLog, LIMITS[xKey]);
        const yr = axisRange(ymin, ymax, yIsLog, LIMITS[yKey]);
        xRange = xr;
        yRange = yr;
        xLog = xIsLog;
        yLog = yIsLog;

        const xToNorm = (v: number) => norm(v, xr, xIsLog);
        const yToNorm = (v: number) => norm(v, yr, yIsLog);

        const position = geometry.getAttribute('position') as THREE.BufferAttribute;
        const color = geometry.getAttribute('color') as THREE.BufferAttribute;
        for (let k = 0; k < n; k++) {
            const s = samples[k];
            position.setXYZ(
                k,
                l + xToNorm(paramValue(s, xKey)) * w,
                t + (1 - yToNorm(paramValue(s, yKey))) * h,
                0
            );
            color.setXYZ(k, s.color.r, s.color.g, s.color.b);
        }
        position.needsUpdate = true;
        color.needsUpdate = true;
        geometry.setDrawRange(0, n);
        renderer.render(scene, camera);
    }

    function pick(event: PointerEvent): number | null {
        if (!canvas || !raycaster || !camera || !points) return null;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        const pointer = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(points)[0];
        return hit?.index !== undefined ? hit.index : null;
    }

    function onPointerMove(event: PointerEvent): void {
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
            name: trackerState.satellites[sample.index]?.name ?? ''
        };
    }

    function onPointerLeave(): void {
        hover = null;
        trackerState.hoveredIndex = -1;
    }

    function onPointerUp(event: PointerEvent): void {
        const index = pick(event);
        if (index !== null) trackerState.pinnedIndex = samples[index].index;
    }

    function onHandleDown(event: PointerEvent): void {
        resizing = true;
        resizeStart = { x: event.clientX, y: event.clientY, w: width, h: height };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }

    function onHandleMove(event: PointerEvent): void {
        if (!resizing) return;
        width = Math.min(MAX_W, Math.max(MIN_W, resizeStart.w + (event.clientX - resizeStart.x)));
        height = Math.min(MAX_H, Math.max(MIN_H, resizeStart.h + (resizeStart.y - event.clientY)));
    }

    function onHandleUp(event: PointerEvent): void {
        resizing = false;
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
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
    function frame(): void {
        rafId = requestAnimationFrame(frame);
        if (elCurrent.length === 0) return;
        const span = elNextEpoch - elPrevEpoch;
        let blend = span > 0 ? (Date.now() - elPrevEpoch) / span : 1;
        if (blend < 0) blend = 0;
        else if (blend > 1) blend = 1;
        for (let k = 0; k < elCurrent.length; k++) {
            const a = k < elPrev.length ? elPrev[k] : (elNext[k] ?? 0);
            const b = k < elNext.length ? elNext[k] : a;
            elCurrent[k] = a + (b - a) * blend;
        }
        draw();
    }

    // Set up three.js once the canvas/host refs exist, and subscribe to the
    // shared propagation service for positions + orbital elements.
    $effect(() => {
        if (!canvas || !host) return;
        const r = new THREE.WebGLRenderer({ canvas, antialias: false });
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
        s.add(pts);
        const ray = new THREE.Raycaster();
        ray.params.Points.threshold = 5;

        renderer = r;
        scene = s;
        camera = cam;
        geometry = geo;
        points = pts;
        raycaster = ray;

        const observer = new ResizeObserver(() => draw());
        observer.observe(host);
        draw();

        const unsubscribe = propagation.subscribe((message) => {
            if (message.type !== 'positions' || !message.elements || message.epoch === undefined)
                return;
            if (elNext.length !== message.elements.length) {
                elPrev = message.elements;
                elPrevEpoch = message.epoch;
            } else {
                elPrev = elNext;
                elPrevEpoch = elNextEpoch;
            }
            elNext = message.elements;
            elNextEpoch = message.epoch;
            if (elCurrent.length !== message.elements.length)
                elCurrent = new Float32Array(message.elements.length);
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

    // Redraw when the active set, catalog, or axes change.
    $effect(() => {
        void samples;
        void xKey;
        void yKey;
        draw();
    });
</script>

{#snippet infoTip(key: Param)}
    <span class="group relative inline-flex">
        <button
            type="button"
            aria-label={`About ${meta(key).label}`}
            class="flex h-4 w-4 items-center justify-center rounded-full border border-brand-text/30 p-0 text-[9px] font-semibold text-brand-text/60 hover:border-brand-text/60 hover:bg-transparent hover:text-brand-text"
            >i</button
        >
        <span
            role="tooltip"
            class="pointer-events-none absolute top-5 right-0 z-40 hidden w-52 rounded border border-brand-secondary bg-brand-bg/95 p-2 text-[10px] leading-snug text-brand-text shadow-lg group-focus-within:block group-hover:block"
            >{meta(key).desc}</span
        >
    </span>
{/snippet}

{#if collapsed}
    <button
        type="button"
        aria-label="Expand orbital graph"
        title="Orbital graph"
        class="pointer-events-auto absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-lg border border-brand-secondary bg-brand-secondary/85 px-3 py-2 text-xs font-semibold text-brand-text-highlight shadow-lg backdrop-blur-sm transition-colors hover:bg-brand-secondary"
        onclick={() => (collapsed = false)}
    >
        <svg viewBox="0 0 12 12" class="h-3 w-3" aria-hidden="true">
            <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.6" fill="none" />
        </svg>
        Orbital graph
    </button>
{:else}
    <div
        class="pointer-events-none absolute bottom-3 left-3 z-20"
        style:width="{width}px"
        style:height="{height}px"
    >
        <div class="pointer-events-auto grid h-full w-full">
            <Panel title="Orbital graph">
                {#snippet actions()}
                    <div class="flex items-center gap-1 pr-4 pb-1">
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
                        bind:value={xKey}
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
                        bind:value={yKey}
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
                        class="flex h-4 items-center justify-center rounded border border-brand-text/30 p-0 px-1.5 text-[9px] font-semibold text-brand-text/60 hover:border-brand-text/60 hover:bg-transparent hover:text-brand-text"
                        onclick={() => (showModel = true)}>?</button
                    >
                </div>

                <div bind:this={host} class="relative min-h-0 flex-1">
                    <canvas
                        bind:this={canvas}
                        class="block h-full w-full cursor-crosshair"
                        onpointermove={onPointerMove}
                        onpointerleave={onPointerLeave}
                        onpointerup={onPointerUp}
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

                    {#if highlightPos}
                        <div
                            class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                            style:left="{highlightPos.x}px"
                            style:top="{highlightPos.y}px"
                            style:width="10px"
                            style:height="10px"
                        ></div>
                    {/if}

                    {#if samples.length === 0}
                        <div
                            class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-brand-text/60"
                        >
                            No active satellites
                        </div>
                    {/if}

                    {#if hover}
                        <div
                            class="pointer-events-none absolute z-20 rounded border border-brand-secondary bg-brand-bg/95 px-2 py-0.5 text-[10px] whitespace-nowrap text-brand-text"
                            style:left="{hover.x + 10}px"
                            style:top="{hover.y + 10}px"
                        >
                            {hover.name}
                        </div>
                    {/if}
                </div>
            </Panel>

            <button
                type="button"
                aria-label="Resize graph"
                class="absolute top-0 right-0 z-30 flex h-4 w-4 cursor-nesw-resize items-center justify-center rounded border-0 p-0 text-brand-text/40 hover:bg-transparent hover:text-brand-text"
                onpointerdown={onHandleDown}
                onpointermove={onHandleMove}
                onpointerup={onHandleUp}
            >
                <svg viewBox="0 0 10 10" class="h-3 w-3" fill="currentColor" aria-hidden="true">
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
