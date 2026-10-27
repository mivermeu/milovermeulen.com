<script lang="ts">
    import { routeColor } from './palette';

    interface Props {
        routes: string[];
        active: string[];
        ontoggle: (route: string) => void;
        onclear: () => void;
    }

    let { routes, active, ontoggle, onclear }: Props = $props();

    const isActive = (route: string) => active.includes(route);
</script>

<div class="flex items-center gap-1.5">
    <div
        class="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto rounded-lg border border-brand-secondary bg-brand-bg/85 p-1 backdrop-blur"
        role="group"
        aria-label="Filter by route"
    >
        {#each routes as route (route)}
            {@const selected = isActive(route)}
            <button
                class="min-w-7 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#0b0f1a] transition-opacity"
                style:background-color={routeColor(route)}
                style:opacity={active.length === 0 || selected ? 1 : 0.35}
                aria-pressed={selected}
                onclick={() => ontoggle(route)}
            >
                {route}
            </button>
        {/each}
    </div>

    {#if active.length}
        <button
            class="rounded-lg border border-brand-secondary bg-brand-bg/85 px-2 py-1 text-[10px] backdrop-blur"
            onclick={onclear}
        >
            all
        </button>
    {/if}
</div>
