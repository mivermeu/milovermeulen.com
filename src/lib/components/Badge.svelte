<!-- Define a CompanyBadge component that provides additional information about
    a company when prompted. -->

<script lang='ts'>
    export let hovering: boolean = false;

    const enter = () => (hovering = true)
    const leave = () => (hovering = false)
</script>

<span class='badge' on:mouseenter={enter} on:mouseleave={leave} role='presentation'>
    <slot />
</span>

<style lang='scss'>
    .badge {
        --badge-padding: 5px;
        position: relative;
        padding: var(--badge-padding);
        margin-right: 7px;
        margin-bottom: 7px;
        background-color: var(--color-button);
        border-radius: var(--border-radius-card);

        font: var(--font-body);
        color: var(--color-text);
    }
</style>