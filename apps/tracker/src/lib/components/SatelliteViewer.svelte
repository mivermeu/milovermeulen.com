<script lang="ts">
    import { onDestroy, untrack } from 'svelte';
    import { GlobeScene } from '$lib/scene/GlobeScene';
    import { propagation } from '$lib/propagation';
    import { trackerState } from '$lib/state.svelte';

    let canvas: HTMLCanvasElement;
    let scene: GlobeScene | undefined = $state();
    // Last tree-filter array applied via setFilter (guard so per-snapshot mask
    // republishes don't re-init the worker); last highlight state applied —
    // both plain, deliberately untracked.
    let appliedFilter: number[] | null = null;
    let ringTarget = -1;

    $effect(() => {
        if (trackerState.satellites.length === 0 || scene) return;
        scene =
            GlobeScene.create(canvas, trackerState.satellites, {
                onError: (message: string) => {
                    trackerState.error = message;
                },
                onHover: (
                    filteredIndex: number,
                    name: string | null,
                    screenX: number,
                    screenY: number
                ) => {
                    if (!scene || filteredIndex < 0 || !name) {
                        trackerState.hovered = null;
                        trackerState.hoveredIndex = -1;
                    } else {
                        const origIdx = scene.getOriginalIndex(filteredIndex);
                        trackerState.hovered = {
                            originalIndex: origIdx,
                            name,
                            screenX,
                            screenY
                        };
                        trackerState.hoveredIndex = origIdx;
                    }
                },
                onSelect: (filteredIndex: number) => {
                    if (!scene) return;
                    if (filteredIndex < 0) {
                        trackerState.pinnedIndex = -1;
                    } else {
                        const origIdx = scene.getOriginalIndex(filteredIndex);
                        if (origIdx < 0) {
                            trackerState.pinnedIndex = -1;
                        } else if (trackerState.pinnedIndex === origIdx) {
                            trackerState.pinnedIndex = -1;
                        } else {
                            trackerState.pinnedIndex = origIdx;
                        }
                    }
                }
            }) ?? undefined;
    });

    $effect(() => {
        if (!scene) return;
        scene.setShowOrbits(trackerState.showOrbits);
        scene.setShowEquatorial(trackerState.showEquatorial);
        scene.setShowGroundTrack(trackerState.showGroundTrack);
    });

    $effect(() => {
        propagation.setMode(trackerState.elementMode);
    });

    $effect(() => {
        if (!scene) return;
        const indices = trackerState.activeIndices;
        const sats = trackerState.satellites;
        const mask = trackerState.brushMask;
        if (sats.length === 0) return;
        // One effect drives both scene entry points: setFilter must only run on
        // an actual tree-filter change — the graph republishes the brush mask
        // once per propagate snapshot, and re-running setFilter there would
        // re-walk the whole catalog (worker re-init per snapshot). GlobeScene
        // treats setFilter as mask-invalidation, so the mask is (re)applied on
        // both paths; it stays render-time-only culling either way (graphBrush.ts).
        if (indices !== appliedFilter) {
            const filtered = indices.map((i) => sats[i]);
            trackerState.hovered = null;
            trackerState.hoveredIndex = -1;
            trackerState.pinnedIndex = -1;
            // Untrack: setFilter re-reads elementMode (for the worker init). If the
            // effect tracked it, a mode toggle would re-walk the whole catalog and
            // re-bump the worker's generation — which pins the graph in snap mode.
            untrack(() => {
                scene?.setFilter(filtered, indices);
                scene?.setBrushMask(mask);
            });
            appliedFilter = indices;
        } else {
            untrack(() => scene?.setBrushMask(mask));
        }
    });

    $effect(() => {
        if (!scene) return;
        // Hover from either view (globe or graph) takes precedence over the pin.
        const index =
            trackerState.hoveredIndex >= 0 ? trackerState.hoveredIndex : trackerState.pinnedIndex;
        const filteredIdx = index >= 0 ? trackerState.activeIndices.indexOf(index) : -1;
        // A pinned/hovered satellite that drifts outside the committed brush
        // region is filtered from both views — its ring must not outlive the
        // culled dot. The cheap state compare keeps the per-snapshot mask churn
        // from rebuilding the highlight geometry when membership is unchanged.
        const mask = trackerState.brushMask;
        const target = filteredIdx >= 0 && (!mask || mask[filteredIdx] === 1) ? filteredIdx : -1;
        if (target === ringTarget) return;
        ringTarget = target;
        if (target >= 0) scene.showHighlight(target);
        else scene.hideHighlight();
    });

    $effect(() => {
        if (!scene) return;
        // Ground track follows the pin only — hover must never trigger an
        // orbit-length worker rebuild (index maps through the active filter).
        const pin = trackerState.pinnedIndex;
        const filteredIdx = pin >= 0 ? trackerState.activeIndices.indexOf(pin) : -1;
        scene.setGroundTrack(filteredIdx);
    });

    onDestroy(() => {
        scene?.dispose();
        scene = undefined;
    });
</script>

<div class="relative h-full w-full overflow-hidden bg-[#1a1a1f]">
    <!-- eslint-disable-next-line svelte/no-unused-svelte-ignore -->
    <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -- interactive 3D viewer surface -->
    <canvas
        bind:this={canvas}
        class="block h-full w-full outline-none"
        tabindex="0"
        role="application"
        aria-label="3D globe visualization of live satellite positions"
    ></canvas>
</div>
