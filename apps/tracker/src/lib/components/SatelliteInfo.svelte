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
    import Panel from './Panel.svelte';

    const DEG = 180 / Math.PI;

    let pinnedIndex = $derived(trackerState.pinnedIndex);
    let hovered = $derived(trackerState.hovered);
    let sat = $derived(pinnedIndex >= 0 ? trackerState.satellites[pinnedIndex] : null);
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
    <div class="pointer-events-auto absolute top-4 left-4 z-30 w-72">
        <Panel title={sat.name}>
            {#snippet actions()}
                <button
                    type="button"
                    class="-mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-brand-text opacity-60 transition-opacity hover:opacity-100"
                    onclick={() => (trackerState.pinnedIndex = -1)}
                    aria-label="Close"
                >
                    ✕
                </button>
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
            </dl>
        </Panel>
    </div>
{/if}
