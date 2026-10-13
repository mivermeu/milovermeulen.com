<script lang="ts">
    import { trackerState } from '$lib/state.svelte';
    import { findMatchingNodeIds, findNode, saveExpanded, restoreExpanded } from '$lib/tree';
    import Panel from './Panel.svelte';
    import TreeNode from './TreeNode.svelte';

    let query = $state('');
    let savedExpanded = new Map<string, boolean>();
    let wasSearching = false;
    let searchInput: HTMLInputElement | undefined = $state();

    const MIN_CHARS = 2;

    // Actually-visible count: the tree filter composed with the graph
    // selection (brush mask), so the header tracks what both views show.
    const visibleCount = $derived.by(() => {
        const mask = trackerState.brushMask;
        if (!mask) return trackerState.activeIndices.length;
        const n = Math.min(mask.length, trackerState.activeIndices.length);
        let count = 0;
        for (let i = 0; i < n; i++) count += mask[i];
        return count;
    });
    const selectionActive = $derived(trackerState.brushMask !== null);

    const visibleIds = $derived(
        trackerState.searchQuery.length >= MIN_CHARS && trackerState.tree
            ? findMatchingNodeIds(
                  trackerState.tree,
                  trackerState.searchQuery,
                  trackerState.satellites
              ).matching
            : null
    );

    function applySearch(q: string) {
        const tree = trackerState.tree;
        if (!tree) return;

        if (q.length >= MIN_CHARS) {
            if (!wasSearching) {
                savedExpanded = new Map();
                saveExpanded(tree, savedExpanded);
                wasSearching = true;
            }
            trackerState.searchQuery = q;
            const result = findMatchingNodeIds(tree, q, trackerState.satellites);
            for (const id of result.expand) {
                const node = findNode(tree, id);
                if (node) node.expanded = true;
            }
        } else {
            trackerState.searchQuery = '';
            if (wasSearching) {
                restoreExpanded(tree, savedExpanded);
                wasSearching = false;
            }
        }
    }

    function onInput(value: string) {
        query = value;
        applySearch(value);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key !== '/') return;
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        searchInput?.focus();
        searchInput?.select();
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<Panel title="Filters">
    <div class="mb-2 text-[10px] text-brand-text">
        Showing <span class="font-mono text-brand-text-highlight">{visibleCount}</span>
        of {trackerState.satellites.length}{#if selectionActive}
            <span class="text-brand-text/60">&nbsp;in selection</span>{/if}
    </div>

    <div class="relative mb-2">
        <input
            type="text"
            placeholder="Search..."
            value={query}
            oninput={(e) => onInput((e.target as HTMLInputElement).value)}
            bind:this={searchInput}
            class="w-full rounded border border-white/20 bg-transparent px-2 py-1 pr-7 text-xs text-brand-text placeholder:text-brand-text/40 focus:border-brand-primary focus:outline-none"
        />
        <span
            class="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded border border-white/20 px-1 text-[10px] leading-none text-brand-text/40"
        >
            /
        </span>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
        {#if trackerState.tree}
            <div role="tree">
                <TreeNode node={trackerState.tree} {visibleIds} />
            </div>
        {/if}
    </div>
</Panel>
