<script lang="ts">
    import { routeColor } from './palette';
    import { HORIZON_S, LOOKBACK_S, buildProgressChart, type ChartBandPoint } from './progress';
    import type { PatternGeometry, PatternHistory, TrainMotion } from './types';

    interface Props {
        motion: TrainMotion;
        geometry: PatternGeometry;
        history: PatternHistory | null;
        now: number;
        past: { t: number; s: number; v: number }[];
    }

    let { motion, geometry, history, now, past }: Props = $props();

    const W = 300;
    const LEFT = 28;
    const RIGHT = 6;
    const DIST_TOP = 16;
    const DIST_BOTTOM = 78;
    const VEL_TOP = 104;
    const VEL_BOTTOM = 158;
    const SPAN = LOOKBACK_S + HORIZON_S;

    const chart = $derived(buildProgressChart(motion, geometry, history, now, past));
    const color = $derived(routeColor(motion.route));

    const xScale = (x: number): number => LEFT + ((x + LOOKBACK_S) / SPAN) * (W - LEFT - RIGHT);
    const yDist = (ds: number): number =>
        DIST_BOTTOM -
        ((ds - chart.minDs) / Math.max(1, chart.maxDs - chart.minDs)) * (DIST_BOTTOM - DIST_TOP);
    const yVel = (v: number): number =>
        VEL_BOTTOM - (Math.max(0, v) / Math.max(1, chart.velMax)) * (VEL_BOTTOM - VEL_TOP);

    const fmt = ([x, y]: [number, number]): string => `${x.toFixed(1)} ${y.toFixed(1)}`;

    function linePath(points: [number, number][]): string {
        return points.length < 2 ? '' : `M${points.map(fmt).join(' L')}`;
    }

    function bandPath(high: [number, number][], low: [number, number][]): string {
        if (high.length < 2) return '';
        return `M${high.map(fmt).join(' L')} L${[...low].reverse().map(fmt).join(' L')} Z`;
    }

    const distHigh = $derived(
        chart.band.map(
            (point: ChartBandPoint) => [xScale(point.x), yDist(point.high)] as [number, number]
        )
    );
    const distLow = $derived(
        chart.band.map(
            (point: ChartBandPoint) => [xScale(point.x), yDist(point.low)] as [number, number]
        )
    );
    const distMedian = $derived(
        chart.band.map(
            (point: ChartBandPoint) => [xScale(point.x), yDist(point.median)] as [number, number]
        )
    );
    const velHigh = $derived(
        chart.band.map(
            (point: ChartBandPoint) => [xScale(point.x), yVel(point.vHigh)] as [number, number]
        )
    );
    const velLow = $derived(
        chart.band.map(
            (point: ChartBandPoint) => [xScale(point.x), yVel(point.vLow)] as [number, number]
        )
    );
    const velMedian = $derived(
        chart.band.map(
            (point: ChartBandPoint) => [xScale(point.x), yVel(point.vMedian)] as [number, number]
        )
    );

    const projectedDistance = $derived(
        chart.projection.map((point) => [xScale(point.x), yDist(point.ds)] as [number, number])
    );
    const projectedSpeed = $derived(
        chart.projection.map((point) => [xScale(point.x), yVel(point.v)] as [number, number])
    );
    const pastDistance = $derived(
        chart.past.map((point) => [xScale(point.x), yDist(point.ds)] as [number, number])
    );
    const pastSpeed = $derived(
        chart.past.map((point) => [xScale(point.x), yVel(point.v)] as [number, number])
    );

    const zeroX = $derived(xScale(0));
    const axes = [-5, 0, 5, 10, 15];
    const km = (metres: number): string => `${(metres / 1000).toFixed(1)} km`;
</script>

<figure class="mt-3 border-t border-brand-secondary pt-2" aria-label="Projected progression">
    <figcaption class="flex items-center justify-between text-[9px] text-brand-text">
        <span>projection · next 15 min</span>
        <span>{chart.runCount} comparable</span>
    </figcaption>

    <svg viewBox="0 0 {W} 176" class="mt-1 w-full" role="img">
        <!-- x grid -->
        {#each axes as minute (minute)}
            {@const x = xScale(minute * 60)}
            <line
                x1={x}
                y1={DIST_TOP}
                x2={x}
                y2={VEL_BOTTOM}
                stroke="#334155"
                stroke-width="0.5"
                stroke-dasharray={minute === 0 ? '2 2' : '1 3'}
            />
            <text {x} y="170" text-anchor="middle" font-size="7.5" fill="#94a3b8">
                {minute === 0 ? 'now' : `${minute > 0 ? '+' : ''}${minute}`}
            </text>
        {/each}

        <!-- distance panel -->
        <text x={LEFT} y="9" font-size="7.5" fill="#94a3b8">distance</text>
        <text x={LEFT - 2} y={DIST_TOP + 3} text-anchor="end" font-size="7" fill="#64748b"
            >{km(chart.maxDs)}</text
        >
        <text x={LEFT - 2} y={DIST_BOTTOM} text-anchor="end" font-size="7" fill="#64748b"
            >{km(chart.minDs)}</text
        >
        {#if Math.abs(chart.minDs) > 120 && Math.abs(chart.maxDs) > 120}
            <text x={LEFT - 2} y={yDist(0) + 2.5} text-anchor="end" font-size="7" fill="#64748b"
                >0</text
            >
        {/if}
        <line
            x1={LEFT}
            y1={yDist(0)}
            x2={W - RIGHT}
            y2={yDist(0)}
            stroke="#475569"
            stroke-width="0.5"
        />

        {#if chart.hasHistory}
            <path d={bandPath(distHigh, distLow)} fill={color} fill-opacity="0.18" />
            <path
                d={linePath(distHigh)}
                fill="none"
                stroke={color}
                stroke-opacity="0.25"
                stroke-width="0.7"
            />
            <path
                d={linePath(distLow)}
                fill="none"
                stroke={color}
                stroke-opacity="0.25"
                stroke-width="0.7"
            />
            <path
                d={linePath(distMedian)}
                fill="none"
                stroke={color}
                stroke-opacity="0.4"
                stroke-width="1"
                stroke-dasharray="2 3"
            />
        {/if}
        {#if chart.past.length > 1}
            <path
                d={linePath(pastDistance)}
                fill="none"
                stroke="#94a3b8"
                stroke-width="1.4"
                stroke-linecap="round"
            />
        {/if}
        {#if chart.hasProjection}
            <path
                d={linePath(projectedDistance)}
                fill="none"
                stroke={color}
                stroke-width="2"
                stroke-linecap="round"
            />
        {/if}
        {#each chart.stops as stop (stop.x)}
            <circle cx={xScale(stop.x)} cy={yDist(stop.ds)} r="1.8" fill={color} opacity="0.8">
                <title>{stop.stop}</title>
            </circle>
        {/each}

        <!-- speed panel -->
        <text x={LEFT} y="98" font-size="7.5" fill="#94a3b8">speed</text>
        <text x={LEFT - 2} y={VEL_TOP + 3} text-anchor="end" font-size="7" fill="#64748b"
            >{chart.velMax}</text
        >
        <text x={LEFT - 2} y={VEL_BOTTOM} text-anchor="end" font-size="7" fill="#64748b">0</text>
        <text x={W - RIGHT} y={VEL_TOP + 3} text-anchor="end" font-size="7" fill="#64748b">m/s</text
        >

        {#if chart.hasHistory}
            <path d={bandPath(velHigh, velLow)} fill={color} fill-opacity="0.16" />
            <path
                d={linePath(velMedian)}
                fill="none"
                stroke={color}
                stroke-opacity="0.4"
                stroke-width="1"
                stroke-dasharray="2 3"
            />
        {/if}
        {#if chart.past.length > 1}
            <path
                d={linePath(pastSpeed)}
                fill="none"
                stroke="#94a3b8"
                stroke-width="1.4"
                stroke-linecap="round"
            />
        {/if}
        {#if chart.hasProjection}
            <path
                d={linePath(projectedSpeed)}
                fill="none"
                stroke={color}
                stroke-width="2"
                stroke-linecap="round"
            />
        {/if}

        <!-- now marker -->
        <line
            x1={zeroX}
            y1={DIST_TOP}
            x2={zeroX}
            y2={VEL_BOTTOM}
            stroke="#e2e8f0"
            stroke-opacity="0.5"
            stroke-width="0.8"
        />
    </svg>

    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-brand-text">
        <span class="flex items-center gap-1">
            <span class="h-0.5 w-3 rounded" style:background-color={color}></span>projected
        </span>
        {#if chart.hasHistory}
            <span class="flex items-center gap-1">
                <span class="h-2 w-3 rounded-sm" style:background-color={color} style:opacity="0.25"
                ></span>history p10–90
            </span>
        {/if}
        {#if chart.past.length > 1}
            <span class="flex items-center gap-1">
                <span class="h-0.5 w-3 rounded bg-[#94a3b8]"></span>observed
            </span>
        {/if}
        {#if !chart.hasHistory}
            <span class="opacity-70">no comparable history yet</span>
        {/if}
    </div>
</figure>
