<script lang="ts">
    import { pageState } from '$lib/state/page.svelte';

    const rotation = $derived(
        pageState.maxScrollY > 0 ? (pageState.scrollY / pageState.maxScrollY) * 180 : 0
    );
</script>

<div
    style:transform="rotate({rotation}deg)"
    class="flex h-20 w-20 items-center justify-center rounded-md bg-black text-center text-xs text-white"
>
    {Math.round(pageState.scrollY)}
</div>
