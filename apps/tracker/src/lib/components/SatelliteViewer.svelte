<script lang="ts">
    import { onDestroy } from 'svelte';
    import { GlobeScene } from '$lib/scene/GlobeScene';
    import { trackerState } from '$lib/state.svelte';

    let canvas: HTMLCanvasElement;
    let scene: GlobeScene | undefined = $state();

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
                    } else {
                        const origIdx = scene.getOriginalIndex(filteredIndex);
                        trackerState.hovered = {
                            originalIndex: origIdx,
                            name,
                            screenX,
                            screenY
                        };
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
        scene.setSpeed(trackerState.speed);
        scene.setShowOrbits(trackerState.showOrbits);
    });

    $effect(() => {
        if (!scene) return;
        const indices = trackerState.activeIndices;
        const sats = trackerState.satellites;
        if (sats.length === 0) return;
        const filtered = indices.map((i) => sats[i]);
        trackerState.hovered = null;
        trackerState.pinnedIndex = -1;
        scene.setFilter(filtered, indices);
    });

    $effect(() => {
        if (!scene) return;
        const pi = trackerState.pinnedIndex;
        const hv = trackerState.hovered;
        if (pi >= 0) {
            const filteredIdx = trackerState.activeIndices.indexOf(pi);
            if (filteredIdx >= 0) scene.showHighlight(filteredIdx);
        } else if (hv) {
            const filteredIdx = trackerState.activeIndices.indexOf(hv.originalIndex);
            if (filteredIdx >= 0) scene.showHighlight(filteredIdx);
        } else {
            scene.hideHighlight();
        }
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
