<!-- Define a CompanyBadge component that provides additional information about
    a company when prompted. -->

<script lang='ts'>
    import type { Company } from '$lib/utils/types';

    export let company: Company;

    let hovering: boolean = false;

    const enter = () => (hovering = true)
    const leave = () => (hovering = false)
</script>

<span class='badge' on:mouseenter={enter} on:mouseleave={leave} role='presentation'>
    {company.name}
    {#if hovering}
        <div class='hover-window'>
            {#if company.logo}
                <img class='hover-image' src={company.logo} alt='{company.name} logo' />
            {/if}
            <div class='hover-body'>
                {company.location.city}, {company.location.country}
                {#if company.website}
                    <br>
                    <a href={company.website} target='_blank'>Go to website</a>
                {/if}
            </div>
        </div>
    {/if}
</span>

<style lang='scss'>
    .badge {
        --badge-padding: 5px;
        --border-radius: 3px;
        position: relative;
        padding: var(--badge-padding);
        margin-right: 7px;
        background-color: var(--color-button);
        border-radius: var(--border-radius);

        .hover-window {
            position: absolute;
            left: 0;
            top: calc(var(--font-size-body) + var(--badge-padding) * 2 + var(--border-radius));
            background-color: var(--color-button);
            border-radius: var(--border-radius);
            z-index: 100000;
            overflow: hidden;

            display: flex;
            flex-direction: column;

            box-shadow: var(--shadow);

            .hover-image {
                flex: 1 1 auto;
            }

            .hover-body {
                padding: var(--badge-padding);
                white-space: nowrap;
                flex: 1 1 auto;
            }
        }
    }
</style>