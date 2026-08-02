<script lang="ts">
    import { pageState } from '$lib/state/page.svelte';

    interface Props {
        children: import('svelte').Snippet;
        min: number;
        max: number;
        sensitivity?: number;
        class?: string;
        'aria-label'?: string;
    }

    let {
        children,
        min,
        max,
        sensitivity = 1,
        class: className = '',
        'aria-label': ariaLabel = 'Dial'
    }: Props = $props();

    let dragging = $state(false);
    let prevAngle = $state(0);
    let el: HTMLDivElement | undefined = $state();
    let dragValue = $state(0);
    let cachedMaxScrollY = $state(0);
    let dialCx = 0;
    let dialCy = 0;
    let pendingScrollY = 0;
    let rafId = 0;
    let lastScrollY = 0;

    function applyScroll(): void {
        rafId = 0;
        if (!dragging) return;

        const diff = pendingScrollY - lastScrollY;
        if (Math.abs(diff) < 2) {
            lastScrollY = pendingScrollY;
            pageState.scrollY = pendingScrollY;
            document.documentElement.scrollTop = pendingScrollY;
            return;
        }

        // Cap per-frame delta so iOS compositor doesn't stall on large jumps
        const maxStep = Math.max(80, cachedMaxScrollY / 8);
        lastScrollY += Math.min(Math.abs(diff), maxStep) * Math.sign(diff);
        pageState.scrollY = lastScrollY;
        document.documentElement.scrollTop = lastScrollY;
        rafId = requestAnimationFrame(applyScroll);
    }

    const fraction = $derived(
        pageState.maxScrollY > 0 ? pageState.scrollY / pageState.maxScrollY : 0
    );
    const value = $derived(min + fraction * (max - min));

    function getAngleRad(clientX: number, clientY: number): number {
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
        lastScrollY = pageState.scrollY;
        dragging = true;
        pageState.draggingDial = true;
        prevAngle = getAngleRad(e.clientX, e.clientY);
        dragValue = value;
        cachedMaxScrollY = pageState.maxScrollY;
    }

    function onPointerMove(e: PointerEvent): void {
        if (!dragging) return;
        const raw = getAngleRad(e.clientX, e.clientY);
        let delta = raw - prevAngle;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        prevAngle = raw;

        const angleDelta = ((delta * 180) / Math.PI) * sensitivity;
        dragValue = Math.max(min, Math.min(max, dragValue + angleDelta));
        const newFraction = (dragValue - min) / (max - min);
        const scrollY = Math.round(newFraction * cachedMaxScrollY);
        pendingScrollY = scrollY;
        if (!rafId) rafId = requestAnimationFrame(applyScroll);
    }

    function onPointerUp(): void {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
        pageState.scrollY = pendingScrollY;
        document.documentElement.scrollTop = pendingScrollY;
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
