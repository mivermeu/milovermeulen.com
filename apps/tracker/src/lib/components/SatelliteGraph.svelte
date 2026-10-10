<script lang="ts">
    import * as THREE from 'three';
    import { trackerState } from '$lib/state.svelte';
    import { categorize } from '$lib/tree';
    import { orbitalElements, type OrbitalElements } from '$lib/orbit';
    import Panel from './Panel.svelte';

    type Param = keyof OrbitalElements;

    const PARAMS: { key: Param; label: string; short: string }[] = [
        { key: 'a', label: 'Semi-major axis (km)', short: 'a' },
        { key: 'e', label: 'Eccentricity', short: 'e' },
        { key: 'i', label: 'Inclination (°)', short: 'i' },
        { key: 'raan', label: 'RAAN (°)', short: 'Ω' },
        { key: 'argp', label: 'Arg. of periapsis (°)', short: 'ω' },
        { key: 'm', label: 'Mean anomaly (°)', short: 'M' }
    ];

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

    let xKey = $state<Param>('a');
    let yKey = $state<Param>('i');

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

    const xLabel = $derived(PARAMS.find((p) => p.key === xKey)?.label ?? '');
    const yLabel = $derived(PARAMS.find((p) => p.key === yKey)?.label ?? '');

    // Only the active (filtered/selected) satellites, with a valid orbit.
    const samples = $derived.by(() => {
        const sats = trackerState.satellites;
        const out: { index: number; el: OrbitalElements; color: THREE.Color }[] = [];
        for (const index of trackerState.activeIndices) {
            const sat = sats[index];
            if (!sat) continue;
            const el = orbitalElements(sat.line2);
            if (!el) continue;
            const category = categorize(sat.name, sat.objectType, sat.category);
            out.push({
                index,
                el,
                color: new THREE.Color(CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other)
            });
        }
        return out;
    });

    function format(key: Param, value: number): string {
        if (key === 'e') return value.toFixed(3);
        if (key === 'a') return Math.round(value).toLocaleString();
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
        const width = host.clientWidth;
        const height = host.clientHeight;
        if (width === 0 || height === 0) return;

        renderer.setSize(width, height, false);
        camera.left = 0;
        camera.right = width;
        camera.top = 0;
        camera.bottom = height;
        camera.updateProjectionMatrix();

        const l = MARGIN.l;
        const t = MARGIN.t;
        const w = Math.max(1, width - MARGIN.l - MARGIN.r);
        const h = Math.max(1, height - MARGIN.t - MARGIN.b);
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
            const x = samples[k].el[xKey];
            const y = samples[k].el[yKey];
            if (x < xmin) xmin = x;
            if (x > xmax) xmax = x;
            if (y < ymin) ymin = y;
            if (y > ymax) ymax = y;
        }
        // The semi-major axis spans LEO (~6,800 km) to deep-space probes
        // (>500,000 km), so it gets a log scale; the others stay linear.
        const xIsLog = xKey === 'a';
        const yIsLog = yKey === 'a';
        if (xIsLog) {
            xmin /= 10 ** 0.02;
            xmax *= 10 ** 0.02;
        } else {
            const xpad = (xmax - xmin || 1) * 0.04;
            xmin = Math.max(0, xmin - xpad);
            xmax += xpad;
        }
        if (yIsLog) {
            ymin /= 10 ** 0.02;
            ymax *= 10 ** 0.02;
        } else {
            const ypad = (ymax - ymin || 1) * 0.04;
            ymin = Math.max(0, ymin - ypad);
            ymax += ypad;
        }
        xRange = [xmin, xmax];
        yRange = [ymin, ymax];
        xLog = xIsLog;
        yLog = yIsLog;

        const xToNorm = xIsLog
            ? (v: number) =>
                  (Math.log10(v) - Math.log10(xmin)) / (Math.log10(xmax) - Math.log10(xmin))
            : (v: number) => (v - xmin) / (xmax - xmin);
        const yToNorm = yIsLog
            ? (v: number) =>
                  (Math.log10(v) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin))
            : (v: number) => (v - ymin) / (ymax - ymin);

        const position = geometry.getAttribute('position') as THREE.BufferAttribute;
        const color = geometry.getAttribute('color') as THREE.BufferAttribute;
        for (let k = 0; k < n; k++) {
            const s = samples[k];
            position.setXYZ(k, l + xToNorm(s.el[xKey]) * w, t + (1 - yToNorm(s.el[yKey])) * h, 0);
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
            return;
        }
        const rect = canvas.getBoundingClientRect();
        hover = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            name: trackerState.satellites[samples[index].index]?.name ?? ''
        };
    }

    function onPointerUp(event: PointerEvent): void {
        const index = pick(event);
        if (index !== null) trackerState.pinnedIndex = samples[index].index;
    }

    // Set up three.js once the canvas/host refs exist (robust Svelte 5 pattern).
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
        const pts = new THREE.Points(
            geo,
            new THREE.PointsMaterial({
                size: 2.5,
                sizeAttenuation: false,
                vertexColors: true,
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

        return () => {
            observer.disconnect();
            geo.dispose();
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

    // Redraw whenever the active set, catalog, or axes change.
    $effect(() => {
        void samples;
        void xKey;
        void yKey;
        draw();
    });
</script>

<Panel title="Orbital graph">
    {#snippet actions()}
        <div class="flex items-center gap-1 pb-1 text-[10px] text-brand-text">
            <select
                bind:value={xKey}
                aria-label="X axis parameter"
                class="rounded border border-brand-secondary bg-brand-bg px-1 py-0.5"
            >
                {#each PARAMS as p (p.key)}
                    <option value={p.key}>{p.short}</option>
                {/each}
            </select>
            <span class="text-brand-text/50">×</span>
            <select
                bind:value={yKey}
                aria-label="Y axis parameter"
                class="rounded border border-brand-secondary bg-brand-bg px-1 py-0.5"
            >
                {#each PARAMS as p (p.key)}
                    <option value={p.key}>{p.short}</option>
                {/each}
            </select>
            <span class="text-brand-text/50">{samples.length}</span>
        </div>
    {/snippet}

    <div bind:this={host} class="relative min-h-0 flex-1">
        <canvas
            bind:this={canvas}
            class="block h-full w-full cursor-crosshair"
            onpointermove={onPointerMove}
            onpointerleave={() => (hover = null)}
            onpointerup={onPointerUp}
        ></canvas>

        {#if samples.length === 0}
            <div
                class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-brand-text/60"
            >
                No active satellites
            </div>
        {/if}

        {#if plot.w > 0}
            <div class="pointer-events-none absolute inset-0 text-[9px] text-brand-text/60">
                {#each tickValues(xRange, xLog) as v, i (i)}
                    <span
                        class="absolute -translate-x-1/2"
                        style:left="{plot.l + (i / (TICKS - 1)) * plot.w}px"
                        style:top="{plot.t + plot.h + 3}px">{format(xKey, v)}</span
                    >
                {/each}
                {#each tickValues(yRange, yLog) as v, i (i)}
                    <span
                        class="absolute -translate-y-1/2 text-right"
                        style:left="0px"
                        style:width="{plot.l - 6}px"
                        style:top="{plot.t + (1 - i / (TICKS - 1)) * plot.h}px"
                        >{format(yKey, v)}</span
                    >
                {/each}
                <span
                    class="absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
                    style:top="{plot.t + plot.h + 12}px">{xLabel}</span
                >
                <span class="absolute left-1 whitespace-nowrap" style:top="0px">{yLabel}</span>
            </div>
        {/if}

        {#if hover}
            <div
                class="pointer-events-none absolute z-10 rounded border border-brand-secondary bg-brand-bg/95 px-2 py-0.5 text-[10px] whitespace-nowrap text-brand-text"
                style:left="{hover.x + 10}px"
                style:top="{hover.y + 10}px"
            >
                {hover.name}
            </div>
        {/if}
    </div>
</Panel>
