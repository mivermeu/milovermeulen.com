<script lang="ts">
    import { onDestroy } from 'svelte';
    import { GlobeScene } from '$lib/scene/GlobeScene';
    import { trackerState } from '$lib/state.svelte';

    let canvas: HTMLCanvasElement;
    let scene: GlobeScene | undefined = $state();

    $effect(() => {
        if (trackerState.satellites.length === 0 || scene) return;
        scene = new GlobeScene(canvas, trackerState.satellites, {
            onSatCount: (count: number) => {
                trackerState.renderedCount = count;
            },
            onError: (message: string) => {
                trackerState.error = message;
            }
        });
    });

    $effect(() => {
        scene?.setSpeed(trackerState.speed);
    });

    $effect(() => {
        scene?.setShowOrbits(trackerState.showOrbits);
    });

    onDestroy(() => {
        scene?.dispose();
        scene = undefined;
    });
</script>

<div class="relative h-full w-full overflow-hidden bg-[#1a1a1f]">
    <canvas
        bind:this={canvas}
        class="block h-full w-full"
        aria-label="3D globe visualization of live satellite positions"
    ></canvas>
</div>