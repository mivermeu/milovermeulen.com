<!-- String multiple CompanyBadges together to make a list that does not break
    in weird places. -->

<script lang='ts'>
    import type { Company } from "$lib/utils/types";
    import { fly } from "svelte/transition";
    import Badge from "./Badge.svelte";

    export let companies: Company[] = []

    let hovering: boolean[] = Array(companies.length).fill(false);
</script>

<div class='badge-container'>
    {#each companies as company, ci}
        <a
            on:click|stopPropagation
            href={company.website}
            target='_blank'
            on:mouseenter={() => hovering[ci] = true}
            on:mouseleave={() => hovering[ci] = false}
        >
            <Badge>
                <u>{company.name}</u>
                {#if hovering[ci]}
                    <div class='hover-window' transition:fly={{y: 30, x: 0, duration: 100}}>
                        {#if company.logo}
                            <img class='hover-image' src={company.logo} alt='{company.name} logo' />
                        {/if}
                        <div class='hover-body'>
                            {company.location.city}, {company.location.country}
                        </div>
                    </div>
                {/if}
            </Badge>
        </a>
    {/each}
</div>

<style lang='scss'>
    .badge-container {
        display: flex;
        flex-wrap: wrap;
    }

    .hover-window {
        pointer-events: none;
        position: absolute;
        left: 0;
        top: calc(var(--font-size-body) + var(--badge-padding) * 2 + var(--border-radius));
        background-color: var(--color-button);
        border-radius: var(--border-radius-card);
        z-index: 100000;
        overflow: hidden;

        display: flex;
        flex-direction: column;

        // Work around a Safari bug that causes shadows to be cut off after animating.
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
        filter: var(--shadow);

        .hover-image {
            flex: 1 1 auto;
            max-width: 250px;
            max-height: 100px;
        }

        .hover-body {
            padding: var(--badge-padding);
            white-space: nowrap;
            flex: 1 1 auto;
            text-align: center;
        }
    }
</style>
