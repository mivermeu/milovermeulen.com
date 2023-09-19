<!-- Define a card element for general use. -->

<script lang='ts'>
    import { createEventDispatcher } from 'svelte';

    export let href: string | undefined = undefined;
    export let additional_class: string | undefined = undefined;

    const dispatch = createEventDispatcher();
    function handle_card_click(): void {
        dispatch('click', href);
    }
</script>

<svelte:element
    this={href? 'a': 'article'}
    {href}
    role={href? 'button': 'article'}
    class='card {additional_class}'
    on:click={handle_card_click}
    {...$$restProps}
>
    <div class='wrapper'>
        {#if $$slots.image}
            <div class='image-container'>
                <slot name='image' />
            </div>
        {/if}
        <div class='content'>
            <slot name='content' />
        </div>
    </div>
</svelte:element>

<style lang='scss'>
    .card {
        background-color: var(--color-card);
        box-shadow: var(--shadow-card);
        border-radius: var(--border-radius-card);
        position: relative;

        // Make sure the entirety of the card's text does not act as a link.
        color: var(--color-text);
        text-decoration: none;

        transition: 0.3s;

        &[href],
        &[onclick] {
            &:hover{
                box-shadow: 0 0 15px var(--color-highlight);
                transform: translate(0, -3px);
            }
        }
    }

    .wrapper {
        display: flex;
        flex-wrap: wrap;
    }

    .image-container {
        position: relative;
        flex: 1 0 30%;
        min-height: 250px;
        max-height: 350px;
        // TODO: Don't repeat the border radius here. 
        border-radius: var(--border-radius-card);
        overflow: hidden;
    }

    .content {
        flex: 1 0 50%;
        padding: var(--text-padding-card);
        margin: auto;
    }
</style>
