<script lang="ts">
    import { onMount } from 'svelte';
    import 'maplibre-gl/dist/maplibre-gl.css';

    import { fetchSnapshot, loadTransitData, type TransitData } from '$lib/data';
    import { createMap, installLayers, paintTrains, updateNetwork } from '$lib/map';
    import { routeColor } from '$lib/palette';
    import { advance, fromSnapshot, positionAt } from '$lib/sim';
    import type { TrainMotion, TrainPosition } from '$lib/types';

    let container: HTMLDivElement;
    let status = $state<'loading' | 'ready' | 'error'>('loading');
    let error = $state('');
    let trains = $state(0);
    let stale = $state(0);
    let feedsOk = $state(0);
    let feedsTotal = $state(0);

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

        const adopt = (snapshot: TransitData['snapshot']) => {
            if (!data) return;
            motions = fromSnapshot(snapshot, data.geometries);
            feedsOk = Object.values(snapshot.feeds).filter((feed) => feed.ok).length;
            feedsTotal = Object.keys(snapshot.feeds).length;
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
                    positioned: true
                });
            }

            paintTrains(map, positions);
            trains = positions.length;
            stale = staleCount;
            frame = requestAnimationFrame(paint);
        };

        const reload = async () => {
            const fresh = await loadTransitData();
            const rolled = data !== null && data.manifest.hash !== fresh.manifest.hash;
            data = fresh;
            adopt(fresh.snapshot);
            if (map && rolled) updateNetwork(map, fresh.graph, fresh.geometries);
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
                await new Promise<void>((resolve) => map?.on('load', () => resolve()));
                if (disposed) {
                    map.remove();
                    return;
                }
                installLayers(map, data!.graph, data!.geometries);
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
        class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4"
    >
        <div
            class="pointer-events-auto rounded-lg border border-brand-secondary bg-brand-bg/85 px-3 py-2 shadow-lg backdrop-blur"
        >
            <h1 class="text-xs font-semibold tracking-[0.3em] text-brand-text-highlight">
                TRANSIT
            </h1>
            <p class="mt-1 text-[11px] leading-relaxed text-brand-text">
                {#if status === 'ready'}
                    {trains} trains · {feedsOk}/{feedsTotal} feeds{#if stale}&nbsp;· {stale} stale{/if}
                {:else if status === 'loading'}
                    loading…
                {:else}
                    unavailable
                {/if}
            </p>
        </div>

        {#if status === 'error'}
            <p
                class="pointer-events-auto max-w-xs rounded-lg border border-brand-accent/50 bg-brand-bg/90 px-3 py-2 text-[11px] text-brand-text"
            >
                {error}
            </p>
        {/if}
    </header>
</div>
