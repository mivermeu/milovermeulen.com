<script lang="ts">
    import { feedLabel, feedTone, formatAge } from './format';
    import type { FeedHealth } from './types';

    interface Props {
        feeds: Record<string, FeedHealth>;
    }

    let { feeds }: Props = $props();

    const entries = $derived(Object.entries(feeds));
    const healthy = $derived(entries.filter(([, feed]) => feed.ok).length);

    const TONE = { ok: '#4ade80', warn: '#facc15', bad: '#f43f5e' } as const;

    function title(name: string, feed: FeedHealth): string {
        const detail = feed.ok
            ? `age ${formatAge(feed.age_s)} · ${feed.trips} trips`
            : (feed.error ?? 'unavailable');
        return `${feedLabel(name)}: ${detail}`;
    }
</script>

<div
    class="flex items-center gap-1.5 rounded-lg border border-brand-secondary bg-brand-bg/85 px-2 py-1.5 backdrop-blur"
    title="Feed health"
>
    {#each entries as [name, feed] (name)}
        <span
            class="h-1.5 w-1.5 rounded-full"
            style:background-color={TONE[feedTone(feed)]}
            title={title(name, feed)}
        ></span>
    {/each}
    <span class="ml-1 text-[10px] text-brand-text tabular-nums">{healthy}/{entries.length}</span>
</div>
