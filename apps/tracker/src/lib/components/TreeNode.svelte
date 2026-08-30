<script lang="ts">
    import TreeNode from './TreeNode.svelte';
    import type { TreeNode as TNode } from '$lib/state.svelte';
    import { toggleNode, toggleExpand } from '$lib/state.svelte';

    let {
        node,
        depth = 0,
        visibleIds = null
    }: { node: TNode; depth?: number; visibleIds?: Set<string> | null } = $props();

    const hasChildren = $derived(node.children.length > 0);
    const indent = $derived(depth * 12);
    let checkbox: HTMLInputElement | undefined = $state();

    $effect(() => {
        if (!checkbox) return;
        checkbox.checked = node.triState === 'all';
        checkbox.indeterminate = node.triState === 'some';
    });

    function handleRowClick(e: MouseEvent) {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        if (hasChildren) {
            toggleExpand(node.id);
        } else {
            toggleNode(node.id);
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (hasChildren) {
                toggleExpand(node.id);
            } else {
                toggleNode(node.id);
            }
        }
    }
</script>

{#if !visibleIds || visibleIds.has(node.id)}
    <div style="padding-left: {indent}px">
        <div
            role="treeitem"
            aria-expanded={hasChildren ? node.expanded : undefined}
            class="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-white/10"
            onclick={handleRowClick}
            onkeydown={handleKeydown}
        >
            <input
                type="checkbox"
                bind:this={checkbox}
                onchange={() => toggleNode(node.id)}
                class="accent-brand-primary"
            />

            <span class="truncate text-xs">
                {node.label}
                {#if hasChildren}
                    <span class="text-[10px] text-brand-text/50">({node.children.length})</span>
                {/if}
            </span>
        </div>

        {#if hasChildren && node.expanded}
            <div>
                {#each node.children as child (child.id)}
                    <TreeNode node={child} depth={depth + 1} {visibleIds} />
                {/each}
            </div>
        {/if}
    </div>
{/if}
