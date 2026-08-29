<script lang="ts">
    import { onDestroy } from 'svelte';
    import { GlobeScene } from '$lib/scene/GlobeScene';
    import { trackerState } from '$lib/state.svelte';

    let canvas: HTMLCanvasElement;
    let scene: GlobeScene | undefined = $state();

    $effect(() => {
        if (trackerState.satellites.length === 0 || scene) return;
        scene = GlobeScene.create(canvas, trackerState.satellites, {
            onSatCount: (count: number) => {
                trackerState.renderedCount = count;
            },
            onError: (message: string) => {
                trackerState.error = message;
            }
        }) ?? undefined;
    });

    $effect(() => {
        if (!scene) return;
        scene.setSpeed(trackerState.speed);
        scene.setShowOrbits(trackerState.showOrbits);
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