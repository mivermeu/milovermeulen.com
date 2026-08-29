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
                onSatCount: (count: number) => {
                    trackerState.renderedCount = count;
                },
                onError: (message: string) => {
                    trackerState.error = message;
                },
                onHover: (index: number, name: string | null, screenX: number, screenY: number) => {
                    if (index < 0 || !name) {
                        trackerState.hovered = null;
                    } else {
                        trackerState.hovered = { index, name, screenX, screenY };
                    }
                },
                onSelect: (index: number) => {
                    if (index < 0) {
                        trackerState.pinnedIndex = -1;
                    } else if (trackerState.pinnedIndex === index) {
                        trackerState.pinnedIndex = -1;
                    } else {
                        trackerState.pinnedIndex = index;
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
        const pi = trackerState.pinnedIndex;
        const hv = trackerState.hovered;
        if (pi >= 0) {
            scene.showHighlight(pi);
        } else if (hv) {
            scene.showHighlight(hv.index);
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
