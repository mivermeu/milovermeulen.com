<script lang="ts">
    import { onMount } from 'svelte';
    import 'maplibre-gl/dist/maplibre-gl.css';

    import FeedHealth from '$lib/FeedHealth.svelte';
    import Inspector from '$lib/Inspector.svelte';
    import RouteFilter from '$lib/RouteFilter.svelte';
    import { fetchSnapshot, loadTransitData, type TransitData } from '$lib/data';
    import { sortRoutes } from '$lib/format';
    import {
        applyRouteFilter,
        createMap,
        installLayers,
        paintTrains,
        updateNetwork
    } from '$lib/map';
    import { routeColor } from '$lib/palette';
    import { advance, fromSnapshot, positionAt } from '$lib/sim';
    import type { FeedHealth as FeedHealthData, TrainMotion, TrainPosition } from '$lib/types';

    let container: HTMLDivElement;
    let status = $state<'loading' | 'ready' | 'error'>('loading');
    let error = $state('');
    let trains = $state(0);
    let stale = $state(0);
    let estimated = $state(0);
    let scheduled = $state(0);
    let feeds = $state<Record<string, FeedHealthData>>({});
    let routes = $state<string[]>([]);
    let activeRoutes = $state<string[]>([]);
    let selectedId = $state<string | null>(null);
    let selectedMotion = $state<TrainMotion | null>(null);

    // Stop ids are platform ids (`G29S`); the graph carries the human names.
    const platformNames: Record<string, string> = {};

    function stopName(stop: string | null): string {
        if (!stop) return '—';
        return platformNames[stop] ?? stop;
    }

    // Set inside onMount; the handlers below run after the map exists.
    let lookup = (_id: string): TrainMotion | null => null;
    let applyFilter = (_routes: string[]): void => {};

    function selectTrain(id: string) {
        selectedId = id;
        selectedMotion = lookup(id);
    }

    function clearSelection() {
        selectedId = null;
        selectedMotion = null;
    }

    function toggleRoute(route: string) {
        activeRoutes = activeRoutes.includes(route)
            ? activeRoutes.filter((candidate) => candidate !== route)
            : [...activeRoutes, route];
        applyFilter(activeRoutes);
    }

    function clearRoutes() {
        activeRoutes = [];
        applyFilter([]);
    }

    onMount(() => {
        let disposed = false;
        let map: ReturnType<typeof createMap> | null = null;
        let data: TransitData | null = null;
        // Simulation state, read only by the rAF loop: deliberately not reactive,
        // so SvelteMap would add overhead for nothing.
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        let motions = new Map<string, TrainMotion>();
        let frame = 0;
        let timer: ReturnType<typeof setInterval> | undefined;
        let last = performance.now();
        let lastPaint = 0;

        lookup = (id) => motions.get(id) ?? null;
        applyFilter = (routes) => {
            if (map) applyRouteFilter(map, routes);
        };

        const adopt = (snapshot: TransitData['snapshot']) => {
            if (!data) return;
            motions = fromSnapshot(snapshot, data.geometries);
            feeds = snapshot.feeds;
            estimated = snapshot.estimated;
            scheduled = snapshot.scheduled_trips;
            if (selectedId !== null && !motions.has(selectedId)) clearSelection();
        };

        const paint = () => {
            if (disposed || !map || !data) return;
            const now = performance.now();
            // A backgrounded tab can hand us a multi-second dt; cap it so trains
            // do not leap across the map when the user comes back.
            const dt = Math.min((now - last) / 1000, 0.25);
            last = now;

            const positions: TrainPosition[] = [];
            let staleCount = 0;
            for (const [id, motion] of motions) {
                const geometry = data.geometries.get(motion.pattern);
                if (!geometry) continue;
                const next = advance(motion, dt, geometry);
                motions.set(id, next);
                const point = positionAt(geometry, next.sTotal);
                if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
                if (next.stale) staleCount += 1;
                positions.push({
                    id,
                    lng: point.lng,
                    lat: point.lat,
                    route: next.route,
                    routeColor: routeColor(next.route),
                    stale: next.stale,
                    reset: next.reset,
                    confidence: next.confidence,
                    positioned: true,
                    selected: id === selectedId
                });
            }

            // setData re-tiles the source on the worker, so publish at ~12 Hz rather
            // than every frame; the sim still advances at display rate.
            if (now - lastPaint >= 80) {
                paintTrains(map, positions);
                lastPaint = now;
                if (selectedId !== null) {
                    selectedMotion = motions.get(selectedId) ?? null;
                }
            }
            trains = positions.length;
            stale = staleCount;
            frame = requestAnimationFrame(paint);
        };

        const reload = async () => {
            const fresh = await loadTransitData();
            const rolled = data !== null && data.manifest.hash !== fresh.manifest.hash;
            data = fresh;
            for (const platform of fresh.graph.platforms) {
                platformNames[platform.id] = platform.name;
            }
            routes = sortRoutes(fresh.graph.patterns.map((pattern) => pattern.route));
            adopt(fresh.snapshot);
            if (map) {
                applyRouteFilter(map, activeRoutes);
                if (rolled) updateNetwork(map, fresh.graph, fresh.geometries);
            }
        };

        const poll = async () => {
            if (!data) return;
            try {
                const snapshot = await fetchSnapshot();
                if (disposed) return;
                if (snapshot.graph && snapshot.graph !== data.manifest.hash) {
                    // The graph was rebuilt under us; positions now refer to a new
                    // pattern set, so reload everything before using them.
                    await reload();
                } else {
                    adopt(snapshot);
                }
            } catch {
                // Keep the last good snapshot; the next tick retries.
            }
        };

        void (async () => {
            try {
                await reload();
                map = createMap(container);
                if (import.meta.env.DEV) {
                    (window as unknown as { __map: unknown }).__map = map;
                }
                await new Promise<void>((resolve) => map?.on('load', () => resolve()));
                if (disposed) {
                    map.remove();
                    return;
                }
                installLayers(map, data!.graph, data!.geometries);

                map.on('click', (event) => {
                    const [feature] = map!.queryRenderedFeatures(event.point, {
                        layers: ['trains-dots']
                    });
                    const id = feature?.properties?.id;
                    if (typeof id === 'string') selectTrain(id);
                    else clearSelection();
                });
                map.on('mouseenter', 'trains-dots', () => {
                    map!.getCanvas().style.cursor = 'pointer';
                });
                map.on('mouseleave', 'trains-dots', () => {
                    map!.getCanvas().style.cursor = '';
                });

                status = 'ready';
                last = performance.now();
                paint();
                timer = setInterval(poll, 30_000);
            } catch (cause) {
                status = 'error';
                error = cause instanceof Error ? cause.message : String(cause);
            }
        })();

        return () => {
            disposed = true;
            cancelAnimationFrame(frame);
            if (timer) clearInterval(timer);
            map?.remove();
        };
    });
</script>

<div class="relative h-dvh w-full overflow-hidden bg-[#0b0f1a]">
    <!-- Explicit size: MapLibre sets position: relative on its container, which defeats
    an `absolute inset-0` sizing strategy. Height comes from the parent instead. -->
    <div bind:this={container} class="h-full w-full" aria-label="Live transit map"></div>

    <header
        class="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3"
    >
        <div
            class="pointer-events-auto rounded-lg border border-brand-secondary bg-brand-bg/85 px-3 py-2 shadow-lg backdrop-blur"
        >
            <h1 class="text-xs font-semibold tracking-[0.3em] text-brand-text-highlight">
                TRANSIT
            </h1>
            <p class="mt-1 text-[11px] leading-relaxed text-brand-text">
                {#if status === 'ready'}
                    {trains} trains{#if activeRoutes.length}&nbsp;· {activeRoutes.length} route{activeRoutes.length ===
                        1
                            ? ''
                            : 's'}{/if}
                    {#if stale}&nbsp;· {stale} stale{/if}
                {:else if status === 'loading'}
                    loading…
                {:else}
                    unavailable
                {/if}
            </p>
            {#if status === 'ready'}
                <p class="text-[10px] text-brand-text">
                    {estimated} estimated · {scheduled} scheduled
                </p>
            {/if}
        </div>

        <div class="flex flex-col items-end gap-2">
            {#if status === 'ready'}
                <FeedHealth {feeds} />
            {/if}
            {#if status === 'error'}
                <p
                    class="pointer-events-auto max-w-xs rounded-lg border border-brand-accent/50 bg-brand-bg/90 px-3 py-2 text-[11px] text-brand-text"
                >
                    {error}
                </p>
            {/if}
        </div>
    </header>

    {#if status === 'ready'}
        <div
            class="absolute inset-x-3 bottom-3 z-20 flex items-end gap-2 sm:right-auto sm:max-w-[60%]"
        >
            <RouteFilter
                {routes}
                active={activeRoutes}
                ontoggle={toggleRoute}
                onclear={clearRoutes}
            />
        </div>

        <div
            class="pointer-events-none absolute right-3 bottom-3 z-10 hidden items-center gap-3 rounded-lg border border-brand-secondary bg-brand-bg/85 px-2.5 py-1.5 text-[10px] text-brand-text backdrop-blur sm:flex"
        >
            <span class="flex items-center gap-1"
                ><span class="h-2 w-2 rounded-full bg-white"></span>train</span
            >
            <span class="flex items-center gap-1"
                ><span class="h-2 w-2 rounded-full bg-white/40"></span>stale</span
            >
            <span class="flex items-center gap-1"
                ><span class="h-2 w-2 rounded-full border border-white/40"></span>re-anchored</span
            >
        </div>

        {#if selectedMotion}
            <Inspector motion={selectedMotion} {stopName} onclose={clearSelection} />
        {/if}
    {/if}
</div>
