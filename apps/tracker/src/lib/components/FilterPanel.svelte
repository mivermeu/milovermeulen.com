<script lang="ts">
    import { untrack } from 'svelte';
    import { trackerState } from '$lib/state.svelte';
    import { findMatchingNodeIds, findNode, saveExpanded, restoreExpanded } from '$lib/tree';
    import Panel from './Panel.svelte';
    import TreeNode from './TreeNode.svelte';

    let savedExpanded = new Map<string, boolean>();
    let wasSearching = false;

    const searchResult = $derived(
        trackerState.searchQuery
            ? findMatchingNodeIds(trackerState.tree!, trackerState.searchQuery)
            : null
    );

    const visibleIds = $derived(searchResult?.matching ?? null);

    $effect(() => {
        const tree = trackerState.tree;
        if (!tree) return;
        const q = trackerState.searchQuery;

        untrack(() => {
            if (q && !wasSearching) {
                savedExpanded = new Map();
                saveExpanded(tree, savedExpanded);
                wasSearching = true;
            } else if (!q && wasSearching) {
                restoreExpanded(tree, savedExpanded);
                wasSearching = false;
            }

            if (searchResult) {
                for (const id of searchResult.expand) {
                    const node = findNode(tree, id);
                    if (node) node.expanded = true;
                }
            }
        });
    });
</script>

<Panel title="Filters">
    <div class="mb-2 text-[10px] text-brand-text">
        Showing <span class="font-mono text-brand-text-highlight"
            >{trackerState.activeIndices.length}</span
        >
        of {trackerState.satellites.length}
    </div>

    <input
        type="text"
        placeholder="Search..."
        value={trackerState.searchQuery}
        oninput={(e) => (trackerState.searchQuery = (e.target as HTMLInputElement).value)}
        class="mb-2 w-full rounded border border-brand-secondary/30 bg-transparent px-2 py-1 text-xs text-brand-text placeholder:text-brand-text/40 focus:border-brand-primary focus:outline-none"
    />

    <div class="min-h-0 flex-1 overflow-y-auto">
        {#if trackerState.tree}
            <div role="tree">
                <TreeNode node={trackerState.tree} {visibleIds} />
            </div>
        {/if}
    </div>
</Panel>
