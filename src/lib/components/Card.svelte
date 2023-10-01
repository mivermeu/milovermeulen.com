<!-- Define a card element for general use. -->

<script lang='ts'>
    import { slide } from 'svelte/transition';
    import downarrow from '$lib/images/icons/down-arrow.svg'

    export let href: string | undefined = undefined;
    export let additional_class: string | undefined = undefined;
    export let details_present: boolean = false;
    export let expand_duration: number = 500;
    export let image_on_right: boolean = false;

    // Protect card from having to handle href and details simultaneously.
    if(href && details_present) {
        throw new Error('Cannot present href and details at the same time.')
    }

    let open: boolean = true;
</script>

<svelte:element
    this={href? 'a': 'div'}
    {href}
    target='_blank'
    role={href? 'a': 'div'}
    class='card {additional_class}'
    on:click={() => open = !open}
    {...$$restProps}
    data-expandable={details_present}
    style='flex-direction: {image_on_right? 'row-reverse': 'row'};'
>
    {#if $$slots.image}
        <div class='image-container'>
            <slot name='image' />
        </div>
    {/if}
    <div class='content'>
        <slot name='content' />
        {#if $$slots.details && details_present}
            {#if open}
                <div
                    class='details-container'
                    transition:slide={{duration: expand_duration}}
                >
                    <slot name='details' />
                </div>
            {/if}
            <div style='transform: scale(1, {open? -1: 1}); transition: {expand_duration}ms;'>
                <div class='expand-arrow' style='--url: url({downarrow});' />
            </div>
        {/if}
    </div>
</svelte:element>

<style lang='scss'>
    .card {
        background-color: var(--color-card);
        border-radius: var(--border-radius-card);
        position: relative;

        // Make sure the entirety of the card's text does not act as a link.
        color: var(--color-text);
        text-decoration: none;

        transition: 0.3s;

        // Work around a Safari bug that causes shadows to be cut off after animating.
        -webkit-transform: translateZ(0);
        transform: translateZ(0);

        &[href], &[data-expandable=true] {
            &:hover {
                filter: var(--shadow);
                translate: var(--shadow-opposite-translation);
                cursor: pointer;
            }
        }

        display: flex;
        flex-wrap: wrap;
    }

    .image-container {
        position: relative;
        flex: 1 0 50%;
        min-width: 250px;
        min-height: 350px;
        border-radius: var(--border-radius-card);
        overflow: hidden;
    }

    .content {
        box-sizing: border-box;
        flex: 1 0 50%;
        padding: var(--text-padding-card);
        margin: auto;
    }

    .details-container {
        // The slide transition stutters if no padding is added, for some reason.
        padding: 0.1px;
    }

    .expand-arrow {
        margin: auto;
        width: 30px;
        height: 30px;
        margin-top: 20px;
        margin-bottom: -10px;

        background-color: var(--color-icon);
        -webkit-mask-image: var(--url);
        mask-image: var(--url);
        -webkit-mask-size: 100%;
        mask-size: 100%;
    }
</style>
