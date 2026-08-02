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

    $effect(() => {
        const node = el;
        if (!node) return;
        function preventTouch(e: TouchEvent) {
            e.preventDefault();
        }
        node.addEventListener('touchstart', preventTouch, { passive: false });
        node.addEventListener('touchmove', preventTouch, { passive: false });
        return () => {
            node.removeEventListener('touchstart', preventTouch);
            node.removeEventListener('touchmove', preventTouch);
        };
    });

    const fraction = $derived(
        pageState.maxScrollY > 0 ? pageState.scrollY / pageState.maxScrollY : 0
    );
    const value = $derived(min + fraction * (max - min));

    function getAngleRad(clientX: number, clientY: number): number {
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.atan2(clientX - cx, -(clientY - cy));
    }

    function onPointerDown(e: PointerEvent): void {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
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
        window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
        pageState.scrollY = scrollY;
    }

    function onPointerUp(): void {
        dragging = false;
        pageState.draggingDial = false;
    }
</script>

<div
    class="touch-none rounded-full select-none {dragging
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
