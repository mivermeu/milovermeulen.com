<!-- Define a badge component with some styling. -->

<span class='badge' role='presentation'>
    <slot />
</span>

<style lang='scss'>
    .badge {
        position: relative;
        padding: 5px;
        margin-right: 7px;
        margin-bottom: 7px;
        background-color: var(--color-button);
        border-radius: var(--border-radius-card);
        display: inline-block;

        font: var(--font-body);
        color: var(--color-text);
    }
</style>