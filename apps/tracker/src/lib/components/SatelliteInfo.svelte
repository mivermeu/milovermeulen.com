<script lang="ts">
    import {
        twoline2satrec,
        propagate,
        gstime,
        eciToGeodetic,
        degreesLat,
        degreesLong
    } from 'satellite.js';
    import { trackerState } from '$lib/state.svelte';
    import { epochAgeDays } from '$lib/satellites/tle';
    import { noradId } from '$lib/url-state';
    import Panel from './Panel.svelte';
    import { isFavorite, toggleFavorite } from '$lib/favorites';

    const DEG = 180 / Math.PI;

    let pinnedIndex = $derived(trackerState.pinnedIndex);
    let hovered = $derived(trackerState.hovered);
    let sat = $derived(pinnedIndex >= 0 ? trackerState.satellites[pinnedIndex] : null);

    // Favorites are stored by NORAD id; collapsible list lives in ControlPanel.
    let norad = $derived(sat ? noradId(sat) : null);
    let satFavorited = $derived(isFavorite(trackerState.favorites, norad));

    function toggleStar(): void {
        if (norad === null) return;
        trackerState.favorites = toggleFavorite(trackerState.favorites, norad);
    }
    let now = $state(Date.now());

    $effect(() => {
        let raf: number;
        const tick = () => {
            now = Date.now();
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    });

    let orbitalData = $derived.by(() => {
        if (!sat) return null;
        const _t = now;
        try {
            const satrec = twoline2satrec(sat.line1, sat.line2);
            const date = new Date(_t);
            const pv = propagate(satrec, date);
            if (!pv.position || typeof pv.position === 'boolean') return null;

            const gmst = gstime(date);
            const geo = eciToGeodetic(pv.position, gmst);

            const periodMin = (2 * Math.PI) / satrec.no / ((2 * Math.PI) / 1440);
            const nRadSec = satrec.no / 60;
            const aKm = Math.pow(398600.4418 / (nRadSec * nRadSec), 1 / 3);

            return {
                lat: degreesLat(geo.latitude),
                lon: degreesLong(geo.longitude),
                alt: geo.height,
                speed:
                    pv.velocity && typeof pv.velocity !== 'boolean'
                        ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z)
                        : null,
                epochAgeDays: epochAgeDays(sat.line1, _t),
                eccentricity: satrec.ecco,
                inclination: satrec.inclo * DEG,
                raan: satrec.nodeo * DEG,
                argPerigee: satrec.argpo * DEG,
                meanAnomaly: satrec.mo * DEG,
                meanMotion: (satrec.no * 1440) / (2 * Math.PI),
                period: periodMin,
                bstar: satrec.bstar,
                apogee: aKm * (1 + satrec.ecco) - 6371,
                perigee: aKm * (1 - satrec.ecco) - 6371
            };
        } catch {
            return null;
        }
    });

    function pad(n: number, w: number): string {
        return String(n).padStart(w, '0');
    }

    function formatCoord(deg: number): string {
        const abs = Math.abs(deg);
        const d = Math.floor(abs);
        const m = Math.floor((abs - d) * 60);
        const s = Math.floor(((abs - d) * 60 - m) * 60);
        return `${pad(d, 3)}°${pad(m, 2)}′${pad(s, 2)}″`;
    }

    function latLabel(deg: number): string {
        return formatCoord(deg) + (deg >= 0 ? ' N' : ' S');
    }

    function lonLabel(deg: number): string {
        return formatCoord(deg) + (deg >= 0 ? ' E' : ' W');
    }
</script>

{#if hovered}
    <div
        class="pointer-events-none absolute top-0 left-0 z-20 -translate-x-1/2 -translate-y-full pb-2 text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
        style="left:{hovered.screenX}px;top:{hovered.screenY}px"
    >
        {hovered.name}
    </div>
{/if}

{#if sat && orbitalData}
    <div class="pointer-events-auto absolute top-1.5 left-1.5 z-30 w-64 md:top-4 md:left-4 md:w-72">
        <Panel title={sat.name}>
            {#snippet actions()}
                <span class="flex items-center gap-1">
                    {#if norad !== null}
                        <button
                            type="button"
                            class="-mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded p-0 text-sm transition-opacity hover:opacity-80"
                            class:text-amber-400={satFavorited}
                            class:text-brand-text={!satFavorited}
                            class:opacity-40={!satFavorited}
                            onclick={toggleStar}
                            aria-pressed={satFavorited}
                            aria-label={satFavorited ? 'Remove from favorites' : 'Add to favorites'}
                            title={satFavorited ? 'Remove from favorites' : 'Add to favorites'}
                        >
                            {satFavorited ? '★' : '☆'}
                        </button>
                    {/if}
                    <button
                        type="button"
                        class="-mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded p-0 text-xs text-brand-text opacity-60 transition-opacity hover:opacity-100"
                        onclick={() => (trackerState.pinnedIndex = -1)}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </span>
            {/snippet}

            <dl class="space-y-1.5 text-xs">
                <div class="flex justify-between">
                    <dt class="text-brand-text">Latitude</dt>
                    <dd class="font-mono text-brand-text-highlight">{latLabel(orbitalData.lat)}</dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-brand-text">Longitude</dt>
                    <dd class="font-mono text-brand-text-highlight">{lonLabel(orbitalData.lon)}</dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-brand-text">Altitude</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.alt.toFixed(1)} km
                    </dd>
                </div>
                {#if orbitalData.speed !== null}
                    <div class="flex justify-between">
                        <dt class="text-brand-text">Speed</dt>
                        <dd class="font-mono text-brand-text-highlight">
                            {orbitalData.speed.toFixed(2)} km/s
                            <span class="text-brand-text/50">ECI</span>
                        </dd>
                    </div>
                {/if}

                <div class="my-2 border-t border-brand-secondary"></div>

                <div class="flex justify-between">
                    <dt class="text-brand-text">Eccentricity</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.eccentricity.toFixed(6)}
                    </dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-brand-text">Inclination</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.inclination.toFixed(2)}°
                    </dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-brand-text">RAAN</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.raan.toFixed(2)}°
                    </dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-brand-text">Arg. of Perigee</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.argPerigee.toFixed(2)}°
                    </dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-brand-text">Mean Anomaly</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.meanAnomaly.toFixed(2)}°
                    </dd>
                </div>

                <div class="my-2 border-t border-brand-secondary"></div>

                <div class="flex justify-between">
                    <dt class="text-brand-text">Mean Motion</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.meanMotion.toFixed(4)} rev/day
                    </dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-brand-text">Period</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.period.toFixed(1)} min
                    </dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-brand-text">Apogee</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.apogee.toFixed(1)} km
                    </dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-brand-text">Perigee</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.perigee.toFixed(1)} km
                    </dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-brand-text">B̄star</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.bstar.toExponential(4)}
                    </dd>
                </div>

                <div class="my-2 border-t border-brand-secondary"></div>

                <div class="flex justify-between">
                    <dt class="text-brand-text">NORAD ID</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {sat.noradId ?? '—'}
                    </dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-brand-text">TLE epoch</dt>
                    <dd class="font-mono text-brand-text-highlight">
                        {orbitalData.epochAgeDays !== null
                            ? `${orbitalData.epochAgeDays.toFixed(1)} d`
                            : '—'}
                    </dd>
                </div>
            </dl>
        </Panel>
    </div>
{/if}
