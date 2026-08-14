<script lang="ts">
    import { pageState } from '$lib/state/page.svelte';

    interface Props {
        children: import('svelte').Snippet;
        min: number;
        max: number;
        class?: string;
        'aria-label'?: string;
    }

    // eslint-disable-next-line svelte/no-unused-props
    let {
        children,
        min,
        max,
        class: className = '',
        'aria-label': ariaLabel = 'Dial'
    }: Props = $props();

    let dragging = $state(false);
    let el: HTMLDivElement | undefined = $state();
    let prevAngle = 0;
    let dragValue = 0;
    let dialCx = 0;
    let dialCy = 0;
    let targetScrollY = 0;
    let rafId = 0;

    const value = $derived(
        pageState.maxScrollY > 0
            ? min + (pageState.scrollY / pageState.maxScrollY) * (max - min)
            : min
    );

    function getAngle(clientX: number, clientY: number): number {
        return Math.atan2(clientX - dialCx, -(clientY - dialCy));
    }

    function cacheCenter(): void {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        dialCx = rect.left + rect.width / 2;
        dialCy = rect.top + rect.height / 2;
    }

    function onPointerDown(e: PointerEvent): void {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        cacheCenter();
        dragging = true;
        pageState.draggingDial = true;
        prevAngle = getAngle(e.clientX, e.clientY);
        dragValue = value;
    }

    function onPointerMove(e: PointerEvent): void {
        if (!dragging) return;
        const raw = getAngle(e.clientX, e.clientY);
        let delta = raw - prevAngle;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        prevAngle = raw;

        dragValue = Math.max(min, Math.min(max, dragValue + (delta * 180) / Math.PI));
        targetScrollY = Math.round(((dragValue - min) / (max - min)) * pageState.maxScrollY);
        // ponytail: RAF coalesces pointermove into one update per frame
        if (!rafId) rafId = requestAnimationFrame(() => {
            rafId = 0;
            pageState.scrollY = targetScrollY;
        });
    }

    function onPointerUp(): void {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
        pageState.scrollY = targetScrollY;
        dragging = false;
        pageState.draggingDial = false;
    }
</script>

<div
    class="drag-dial touch-none rounded-full select-none {dragging
        ? 'cursor-grabbing'
        : 'cursor-grab'} {className}"
    bind:this={el}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    role="slider"
    aria-label={ariaLabel}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    tabindex="0"
>
    {@render children()}
</div>

<style>
    :global(.drag-dial *) {
        touch-action: none;
    }
</style>