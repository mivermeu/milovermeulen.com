import { pageState } from '$lib/state/page.svelte';

const FRICTION = 0.003;
const MIN_VELOCITY = 0.02;

let momentumRaf = 0;
let momentumVelocity = 0;
let momentumLastTime = 0;

function clampScroll(y: number) {
    return Math.max(0, Math.min(pageState.maxScrollY, y));
}

function cancelMomentum() {
    if (momentumRaf) {
        cancelAnimationFrame(momentumRaf);
        momentumRaf = 0;
    }
    momentumVelocity = 0;
}

function momentumStep(now: number) {
    const dt = Math.min(now - momentumLastTime, 32);
    momentumLastTime = now;

    momentumVelocity *= Math.exp(-FRICTION * dt);

    if (pageState.draggingDial || Math.abs(momentumVelocity) < MIN_VELOCITY) {
        momentumRaf = 0;
        return;
    }

    pageState.scrollY = clampScroll(pageState.scrollY + momentumVelocity * dt);

    if (pageState.scrollY <= 0 || pageState.scrollY >= pageState.maxScrollY) {
        momentumRaf = 0;
        momentumVelocity = 0;
        return;
    }

    momentumRaf = requestAnimationFrame(momentumStep);
}

function startMomentum(v: number) {
    cancelMomentum();
    if (Math.abs(v) < MIN_VELOCITY) return;
    momentumVelocity = v;
    momentumLastTime = performance.now();
    momentumRaf = requestAnimationFrame(momentumStep);
}

export function attachFakeScroll(viewport: HTMLElement, content: HTMLElement): () => void {
    let touchStartY = 0;
    let touchStartScrollY = 0;
    let touchLastY = 0;
    let touchLastTime = 0;
    let touchVelocity = 0;

    function updateMaxScrollY() {
        pageState.maxScrollY = Math.max(0, content.scrollHeight - viewport.clientHeight);
    }

    function onWheel(e: WheelEvent) {
        if (pageState.draggingDial) return;
        cancelMomentum();
        pageState.scrollY = clampScroll(pageState.scrollY + e.deltaY);
    }

    function onTouchStart(e: TouchEvent) {
        if (pageState.draggingDial) return;
        cancelMomentum();
        touchStartY = e.touches[0].clientY;
        touchStartScrollY = pageState.scrollY;
        touchLastY = touchStartY;
        touchLastTime = performance.now();
        touchVelocity = 0;
    }

    function onTouchMove(e: TouchEvent) {
        if (pageState.draggingDial) return;
        e.preventDefault();
        const y = e.touches[0].clientY;
        const now = performance.now();
        const dt = now - touchLastTime;
        if (dt > 0) {
            // finger velocity positive = moving down; scroll velocity is the opposite
            const instVel = -(y - touchLastY) / dt;
            touchVelocity = touchVelocity * 0.5 + instVel * 0.5;
        }
        touchLastY = y;
        touchLastTime = now;
        const deltaY = touchStartY - y;
        pageState.scrollY = clampScroll(touchStartScrollY + deltaY);
    }

    function onTouchEnd() {
        if (pageState.draggingDial) return;
        startMomentum(touchVelocity);
    }

    updateMaxScrollY();
    const ro = new ResizeObserver(updateMaxScrollY);
    ro.observe(content);

    viewport.addEventListener('wheel', onWheel, { passive: true });
    viewport.addEventListener('touchstart', onTouchStart, { passive: false });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd);
    viewport.addEventListener('touchcancel', onTouchEnd);

    return () => {
        ro.disconnect();
        viewport.removeEventListener('wheel', onWheel);
        viewport.removeEventListener('touchstart', onTouchStart);
        viewport.removeEventListener('touchmove', onTouchMove);
        viewport.removeEventListener('touchend', onTouchEnd);
        viewport.removeEventListener('touchcancel', onTouchEnd);
        cancelMomentum();
    };
}

export function cancelFakeScrollMomentum() {
    cancelMomentum();
}
