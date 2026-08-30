<script lang="ts">
    import { trackerState } from '$lib/state.svelte';
    import Panel from './Panel.svelte';
    import TreeNode from './TreeNode.svelte';
</script>

<Panel title="Filters">
    <div class="mb-2 text-[10px] text-brand-text">
        Showing <span class="font-mono text-brand-text-highlight"
            >{trackerState.activeIndices.length}</span
        >
        of {trackerState.satellites.length}
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
        {#if trackerState.tree}
            <div role="tree">
                <TreeNode node={trackerState.tree} />
            </div>
        {/if}
    </div>
</Panel>
