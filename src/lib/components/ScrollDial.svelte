<script lang="ts">
    import { pageState } from '$lib/state/page.svelte';
    import DragDial from '$lib/components/elements/DragDial.svelte';
    import Raised from '$lib/components/elements/Raised.svelte';
    import Noise from '$lib/components/elements/Noise.svelte';

    interface Props {
        class?: string;
    }

    let { class: className }: Props = $props();

    const startAngle = 0;
    const angleRange = 720;

    const dialRotation = $derived(
        pageState.maxScrollY > 0
            ? startAngle + (pageState.scrollY / pageState.maxScrollY) * angleRange
            : startAngle
    );
</script>

<DragDial
    class="aspect-square w-full shadow-indent {className}"
    min={startAngle}
    max={startAngle + angleRange}
    aria-label="Fast scroll"
>
    <Raised
        className="h-[calc(100%-0.5rem)] aspect-square m-1 rounded-full bg-brand-bg relative overflow-visible"
    >
        <div style:transform="rotate({dialRotation}deg)" class="h-full w-full rounded-full">
            <Noise className="rounded-full" />
            <div class="absolute left-1/2 mt-2 h-5 w-0.5 -translate-x-1/2 bg-brand-text"></div>
            <div
                class="absolute bottom-0 left-1/2 mb-2 h-5 w-0.5 -translate-x-1/2 bg-brand-text"
            ></div>
        </div>
    </Raised>
</DragDial>
