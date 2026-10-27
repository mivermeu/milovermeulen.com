<script lang="ts">
    import { formatConfidence, formatEta, formatSpeed, statusLabel } from './format';
    import { routeColor } from './palette';
    import type { TrainMotion } from './types';

    interface Props {
        motion: TrainMotion;
        stopName: (stop: string | null) => string;
        onclose: () => void;
    }

    let { motion, stopName, onclose }: Props = $props();
</script>

<aside
    class="pointer-events-auto absolute inset-x-0 bottom-0 z-30 max-h-[50dvh] overflow-y-auto rounded-t-xl border-t border-brand-secondary bg-brand-bg/95 p-3 shadow-2xl backdrop-blur sm:inset-x-auto sm:top-20 sm:right-3 sm:bottom-3 sm:max-h-none sm:w-80 sm:rounded-lg sm:border"
    aria-label="Train details"
>
    <header class="flex items-start gap-2">
        <span
            class="mt-0.5 inline-flex min-w-7 items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#0b0f1a]"
            style:background-color={routeColor(motion.route)}
        >
            {motion.route ?? '?'}
        </span>
        <div class="min-w-0 flex-1">
            <p class="truncate text-xs text-brand-text-highlight">{motion.id}</p>
            <p class="text-[10px] text-brand-text">
                {statusLabel(motion.status)} · {formatSpeed(motion.v)}
            </p>
        </div>
        <button
            class="-mt-1 -mr-1 px-1.5 py-0.5 text-base leading-none"
            onclick={onclose}
            aria-label="Close train details">×</button
        >
    </header>

    {#if motion.stale}
        <p
            class="mt-2 rounded border border-brand-text-accent/40 px-2 py-1 text-[10px] text-brand-text"
        >
            No fresh vehicle report for this train; position is extrapolated.
        </p>
    {/if}
    {#if motion.reset}
        <p class="mt-2 rounded border border-brand-accent/40 px-2 py-1 text-[10px] text-brand-text">
            Position re-anchored this cycle — the feed moved this train.
        </p>
    {/if}

    {#if motion.next.length}
        <ol class="mt-3 space-y-1">
            {#each motion.next as stop, index (stop.stop ?? index)}
                <li class="flex items-baseline justify-between gap-3 text-[11px]">
                    <span class="truncate text-brand-text">{stopName(stop.stop)}</span>
                    <span class="shrink-0 text-brand-text-highlight tabular-nums">
                        {formatEta(stop.arr ?? stop.dep)}
                    </span>
                </li>
            {/each}
        </ol>
    {:else}
        <p class="mt-3 text-[11px] text-brand-text">No upcoming stops in the feed.</p>
    {/if}

    <footer
        class="mt-3 flex items-center justify-between border-t border-brand-secondary pt-2 text-[10px] text-brand-text"
    >
        <span>{formatConfidence(motion.confidence)} confidence</span>
        <span class="truncate">{motion.pattern.slice(0, 10)}</span>
    </footer>
</aside>
