<script lang="ts">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import {
        argumentOfLatitudeFromElements,
        elementsToPosition,
        meanAnomalyFromArgumentOfLatitude,
        orbitalPeriodSeconds,
        trueAnomalyFromMean,
        type OrbitalElements
    } from '$lib/orbit';

    let { onclose }: { onclose: () => void } = $props();

    const EARTH_RADIUS_KM = 6371;
    const EARTH_MU = 398600.4418; // km^3/s^2
    const EARTH_UNITS = 6.4;
    const SCALE = EARTH_UNITS / EARTH_RADIUS_KM;
    const ORBIT_SAMPLES = 256;

    let el = $state<OrbitalElements>({ a: 11000, e: 0.2, i: 51.5, raan: 40, argp: 60, m: 0 });

    const u = $derived(argumentOfLatitudeFromElements(el));
    const nu = $derived(trueAnomalyFromMean(el.m, el.e));
    const periodMin = $derived(orbitalPeriodSeconds(el.a) / 60);
    const perigeeAlt = $derived(el.a * (1 - el.e) - EARTH_RADIUS_KM);
    const apogeeAlt = $derived(el.a * (1 + el.e) - EARTH_RADIUS_KM);

    const SLIDERS: {
        key: keyof OrbitalElements;
        label: string;
        symbol: string;
        min: number;
        max: number;
        step: number;
    }[] = [
        { key: 'a', label: 'Semi-major axis', symbol: 'a', min: 6600, max: 45000, step: 50 },
        { key: 'e', label: 'Eccentricity', symbol: 'e', min: 0, max: 0.9, step: 0.005 },
        { key: 'i', label: 'Inclination', symbol: 'i', min: 0, max: 180, step: 0.5 },
        { key: 'raan', label: 'RAAN', symbol: 'Ω', min: 0, max: 360, step: 1 },
        { key: 'argp', label: 'Arg. of periapsis', symbol: 'ω', min: 0, max: 360, step: 1 },
        { key: 'm', label: 'Mean anomaly', symbol: 'M', min: 0, max: 360, step: 1 }
    ];

    // Derived sliders: each sets `a` (holding `e`), so moving one moves the others.
    const DERIVED_SLIDERS: {
        key: 'perigee' | 'apogee' | 'period';
        label: string;
        symbol: string;
        min: number;
        max: number;
        step: number;
        value: () => number;
        set: (v: number) => void;
        format: (v: number) => string;
    }[] = [
        {
            key: 'perigee',
            label: 'Perigee altitude',
            symbol: 'peri',
            min: 0,
            max: 40000,
            step: 10,
            value: () => perigeeAlt,
            set: setPerigee,
            format: (v) => `${Math.round(v).toLocaleString()} km`
        },
        {
            key: 'apogee',
            label: 'Apogee altitude',
            symbol: 'apo',
            min: 0,
            max: 40000,
            step: 10,
            value: () => apogeeAlt,
            set: setApogee,
            format: (v) => `${Math.round(v).toLocaleString()} km`
        },
        {
            key: 'period',
            label: 'Orbital period',
            symbol: 'T',
            min: 80,
            max: 1500,
            step: 1,
            value: () => periodMin,
            set: setPeriod,
            format: (v) => `${v.toFixed(1)} min`
        }
    ];

    let canvas: HTMLCanvasElement | undefined = $state();
    let host: HTMLDivElement | undefined = $state();
    let dialog: HTMLDivElement | undefined = $state();

    let camera: THREE.PerspectiveCamera | undefined;
    let controls: OrbitControls | undefined;
    let orbitLine: THREE.LineLoop | undefined;
    let satellite: THREE.Mesh | undefined;
    let nodeLine: THREE.Line | undefined;
    let periapsisLine: THREE.Line | undefined;
    let lastA = 0;

    function setElement(key: keyof OrbitalElements, value: number): void {
        el = { ...el, [key]: value };
    }

    function setU(value: number): void {
        el = { ...el, m: meanAnomalyFromArgumentOfLatitude(value, el) };
    }

    function setPerigee(value: number): void {
        el = { ...el, a: (value + EARTH_RADIUS_KM) / (1 - el.e) };
    }

    function setApogee(value: number): void {
        el = { ...el, a: (value + EARTH_RADIUS_KM) / (1 + el.e) };
    }

    function setPeriod(value: number): void {
        el = { ...el, a: Math.cbrt(EARTH_MU * ((value * 60) / (2 * Math.PI)) ** 2) };
    }

    function formatValue(key: keyof OrbitalElements, value: number): string {
        if (key === 'e') return value.toFixed(3);
        if (key === 'a') return `${Math.round(value).toLocaleString()} km`;
        return `${value.toFixed(1)}°`;
    }

    function ringPoints(radius: number, segments: number): THREE.BufferGeometry {
        const pts: number[] = [];
        for (let k = 0; k <= segments; k++) {
            const t = (k / segments) * Math.PI * 2;
            pts.push(Math.cos(t) * radius, Math.sin(t) * radius, 0);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        return geo;
    }

    function lineBetween(color: number): THREE.Line {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        return new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity: 0.9,
                depthWrite: false,
                depthTest: false
            })
        );
    }

    function setLine(line: THREE.Line, to: [number, number, number]): void {
        const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        attr.setXYZ(0, 0, 0, 0);
        attr.setXYZ(1, to[0], to[1], to[2]);
        attr.needsUpdate = true;
    }

    $effect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                onclose();
                return;
            }
            // Tab trap: with aria-modal set, focus must stay inside the dialog.
            if (event.key === 'Tab' && dialog) {
                const focusables = dialog.querySelectorAll<HTMLElement>(
                    'button, input, [tabindex="0"]'
                );
                if (focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // Move focus into the dialog on open and hand it back on close.
    $effect(() => {
        const previous = document.activeElement as HTMLElement | null;
        dialog?.focus();
        return () => previous?.focus();
    });

    $effect(() => {
        if (!canvas || !host) return;
        const r = new THREE.WebGLRenderer({ canvas, antialias: true });
        r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        r.setClearColor(0x000000, 0);

        const s = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
        cam.up.set(0, 0, 1);
        cam.position.copy(new THREE.Vector3(0.7, -1, 0.6).normalize().multiplyScalar(24));

        const c = new OrbitControls(cam, canvas);
        c.enableDamping = true;
        c.dampingFactor = 0.08;
        c.enablePan = false;
        c.minDistance = EARTH_UNITS * 1.1;
        c.maxDistance = 5000;
        c.listenToKeyEvents(canvas);

        const earth = new THREE.Mesh(
            new THREE.SphereGeometry(EARTH_UNITS, 48, 32),
            new THREE.MeshBasicMaterial({
                color: 0x262e42,
                transparent: true,
                opacity: 0.82,
                depthWrite: false
            })
        );
        s.add(earth);

        s.add(
            new THREE.Line(
                ringPoints(EARTH_UNITS, 120),
                new THREE.LineBasicMaterial({ color: 0x6b8ab8, transparent: true, opacity: 0.5 })
            )
        );

        const orbGeo = new THREE.BufferGeometry();
        orbGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(ORBIT_SAMPLES * 3), 3)
        );
        orbitLine = new THREE.LineLoop(orbGeo, new THREE.LineBasicMaterial({ color: 0x818cf8 }));
        s.add(orbitLine);

        nodeLine = lineBetween(0x22c55e);
        periapsisLine = lineBetween(0xfbbf24);
        s.add(nodeLine, periapsisLine);

        satellite = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        s.add(satellite);

        camera = cam;
        controls = c;

        const observer = new ResizeObserver(() => {
            const w = host?.clientWidth ?? 0;
            const h = host?.clientHeight ?? 0;
            if (!w || !h) return;
            r.setSize(w, h, false);
            cam.aspect = w / h;
            cam.updateProjectionMatrix();
        });
        observer.observe(host);

        let raf = 0;
        const loop = (): void => {
            raf = requestAnimationFrame(loop);
            c.update();
            r.render(s, cam);
        };
        raf = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
            c.dispose();
            s.traverse((object) => {
                const mesh = object as THREE.Mesh;
                mesh.geometry?.dispose();
                const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
                if (Array.isArray(material)) material.forEach((m) => m.dispose());
                else material?.dispose();
            });
            r.dispose();
            camera = undefined;
            controls = undefined;
            orbitLine = undefined;
            satellite = undefined;
            nodeLine = undefined;
            periapsisLine = undefined;
        };
    });

    $effect(() => {
        if (!orbitLine || !satellite || !nodeLine || !periapsisLine || !camera || !controls) return;

        const attr = orbitLine.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let k = 0; k < ORBIT_SAMPLES; k++) {
            const [x, y, z] = elementsToPosition({ ...el, m: (k / ORBIT_SAMPLES) * 360 });
            attr.setXYZ(k, x * SCALE, y * SCALE, z * SCALE);
        }
        attr.needsUpdate = true;
        orbitLine.geometry.computeBoundingSphere();

        const [sx, sy, sz] = elementsToPosition(el);
        satellite.position.set(sx * SCALE, sy * SCALE, sz * SCALE);

        const [nx, ny, nz] = elementsToPosition({
            ...el,
            m: meanAnomalyFromArgumentOfLatitude(0, el)
        });
        setLine(nodeLine, [nx * SCALE, ny * SCALE, nz * SCALE]);

        const [px, py, pz] = elementsToPosition({ ...el, m: 0 });
        setLine(periapsisLine, [px * SCALE, py * SCALE, pz * SCALE]);

        if (el.a !== lastA) {
            lastA = el.a;
            const dist = el.a * SCALE * 2.8;
            controls.maxDistance = dist * 6;
            const dir = camera.position.clone().sub(controls.target).normalize();
            camera.position.copy(controls.target).addScaledVector(dir, dist);
            controls.update();
        }
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
    class="app-shell fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 md:p-4"
    onclick={onclose}
>
    <div
        bind:this={dialog}
        class="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-brand-secondary bg-brand-secondary/95 shadow-2xl backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Orbital element explorer"
        tabindex="-1"
        onclick={(event) => event.stopPropagation()}
    >
        <div
            class="flex shrink-0 items-center justify-between border-b border-brand-secondary px-4 py-2"
        >
            <span class="text-sm font-semibold text-brand-text-highlight"
                >Orbital element explorer</span
            >
            <button
                type="button"
                aria-label="Close"
                class="flex h-6 w-6 items-center justify-center rounded border border-brand-secondary p-0 text-brand-text hover:bg-white/10"
                onclick={onclose}
            >
                <svg viewBox="0 0 12 12" class="h-3 w-3" aria-hidden="true">
                    <path
                        d="M2 2 10 10M10 2 2 10"
                        stroke="currentColor"
                        stroke-width="1.6"
                        fill="none"
                    />
                </svg>
            </button>
        </div>

        <div class="flex min-h-0 flex-1 flex-col md:flex-row">
            <div bind:this={host} class="relative min-h-72 flex-1 md:min-h-0">
                <canvas
                    bind:this={canvas}
                    class="block h-full w-full cursor-grab active:cursor-grabbing"
                ></canvas>
                <span
                    class="pointer-events-none absolute bottom-2 left-2 text-[10px] text-brand-text/50"
                    >Drag to rotate · scroll to zoom</span
                >
            </div>

            <div
                class="w-full shrink-0 overflow-y-auto border-t border-brand-secondary p-3 md:w-80 md:border-t-0 md:border-l md:p-4"
            >
                <div class="space-y-3 text-xs">
                    {#each SLIDERS as s (s.key)}
                        <label class="block">
                            <span class="flex items-baseline justify-between gap-2">
                                <span class="text-brand-text"
                                    >{s.label}
                                    <span class="text-brand-text/50">{s.symbol}</span></span
                                >
                                <span class="font-mono text-brand-text-highlight"
                                    >{formatValue(s.key, el[s.key])}</span
                                >
                            </span>
                            <input
                                type="range"
                                min={s.min}
                                max={s.max}
                                step={s.step}
                                value={el[s.key]}
                                oninput={(event) => setElement(s.key, +event.currentTarget.value)}
                                class="mt-1 w-full accent-brand-primary"
                            />
                        </label>
                    {/each}

                    <label class="block">
                        <span class="flex items-baseline justify-between gap-2">
                            <span class="text-brand-text"
                                >Argument of latitude <span class="text-brand-text/50">u</span
                                ></span
                            >
                            <span class="font-mono text-brand-text-highlight">{u.toFixed(1)}°</span>
                        </span>
                        <input
                            type="range"
                            min="0"
                            max="360"
                            step="1"
                            value={u}
                            oninput={(event) => setU(+event.currentTarget.value)}
                            class="mt-1 w-full accent-brand-primary"
                        />
                    </label>

                    {#each DERIVED_SLIDERS as s (s.key)}
                        <label class="block">
                            <span class="flex items-baseline justify-between gap-2">
                                <span class="text-brand-text"
                                    >{s.label}
                                    <span class="text-brand-text/50">{s.symbol}</span></span
                                >
                                <span class="font-mono text-brand-text-highlight"
                                    >{s.format(s.value())}</span
                                >
                            </span>
                            <input
                                type="range"
                                min={s.min}
                                max={s.max}
                                step={s.step}
                                value={s.value()}
                                oninput={(event) => s.set(+event.currentTarget.value)}
                                class="mt-1 w-full accent-brand-primary"
                            />
                        </label>
                    {/each}

                    <dl
                        class="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-brand-secondary pt-3 text-[10px] text-brand-text/70"
                    >
                        <dt>True anomaly ν</dt>
                        <dd class="text-right font-mono text-brand-text">{nu.toFixed(1)}°</dd>
                    </dl>
                </div>
            </div>
        </div>
    </div>
</div>
